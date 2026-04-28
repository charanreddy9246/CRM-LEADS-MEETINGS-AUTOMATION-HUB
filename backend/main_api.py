import os
from typing import Optional
from dotenv import load_dotenv
import json
import logging
import shutil
import asyncio
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from groq import Groq
import base64
from openai import OpenAI
import fitz  # PyMuPDF
from docx import Document
from PIL import Image
import io

# Zoho MCP Imports
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# ============================================================
# CONFIGURATION & PROMPTS
# ============================================================
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ExpertAdminAPI")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Load EVERYTHING from root .env
load_dotenv(os.path.join(BASE_DIR, ".env"))


SYSTEM_PROMPT_CLEANING = """
You are a transcript cleaning tool. You have ONE job only: remove filler words.

REMOVE ONLY THESE:
- um, uh, ah, oh, hmm, haan, acha, okay okay, yeah yeah, so so

RESTORE THESE ALWAYS:
- "newly login" or "new lead" → new lead login

STRICT RULES:
1. ANTI-POLITE MANDATE: NEVER add "Thank you", "Watching", "Goodbye", or any polite closing.
2. MECHANICAL STOP: Stop exactly where the user stopped. 
3. DURATION MANDATE: Even if the transcript is only 1 or 2 words long, you MUST return the cleaned version.
4. PIN-TO-PIN: Do not change words with meaning.
5. Return only cleaned transcript.
"""

SYSTEM_PROMPT_MEETING_EXTRACTION = """
Extract ALL individual meetings or field visits from the document.

STRICT FIELD MAPPING:
1. OFFICE/COMPANY HEADERS: If a section starts with an Office/Company name (e.g., "SLN Developer Office") and NO specific individual name is listed as a header, you MUST:
   - Set 'Meeting_Title' = The Office/Company Name (e.g., "SLN Developer Office").
   - Set 'Contact_Name' = "Unknown".
2. INDIVIDUAL HEADERS: If a specific person is listed (e.g., "Thuraka Ajay"), set their name as 'Contact_Name' and use the category (e.g., "BANKER") as the 'Meeting_Title'.
3. SEPARATE RECORDS: Create separate entries for different phone numbers.
4. NO HALLUCINATIONS: Do not use "Office Visit" as a generic title. Use the main header found at the top of the entry (e.g., "FIELD ACTIVITY" or "BANKER") as the 'Meeting_Title'.
5. IGNORE NOTES FOR TITLE: Do NOT pull names or categories from the "NOTE:" field to use as the 'Meeting_Title'. Notes belong in the description only.

Output Format (JSON):
{
  "meetings": [
    {
      "Contact_Name": "string (Specific person's name or 'Unknown')",
      "Meeting_Title": "string (The Subject/Office Name/Category)",
      "Start_DateTime": "ISO 8601 string",
      "End_DateTime": "ISO 8601 string",
      "Participants": [{ "name": "string", "phone": "string or null" }],
      "Description": "string (The full note)",
      "Location": "string"
    }
  ]
}
"""

SYSTEM_PROMPT_EXTRACTION = """You are an Autonomous Senior Zoho CRM Architect & Data Auditor. 
Your task is to analyze the literal transcript, extract data, and assess quality.

AUDITOR PROTOCOLS:
- Confidence_Score: Rate the clarity of the lead data from 0-100.
- Needs_Review: Set to TRUE if:
  * Last_Name is 'Unknown'.
  * Requested_Loan_Amount is missing.
  * The transcript is too noisy/brief to confirm intent.

ZERO-LOSS MANDATE:
- NEVER add "Thank you for watching" or pleasantries.
- Stop exactly where the transcript ends.

EXTRACTION RULES:
1. ENTITY IDENTIFICATION: Identify subject as 'Last_Name'. Agent is ignored.
   - If the transcript only mentions one name (e.g. "Karthik"), set it as 'Last_Name' and keep 'First_Name' as NULL. NEVER repeat the same name in both.
2. DYNAMIC FIELD CLASSIFICATION: Individual vs Corporate.
3. FINANCIAL PRECISION: Numbers as strings.
4. LOAN ANALYSIS: Always extract the 'Loan_Type' (e.g. Home Loan, Mortgage, Personal) and 'Requested_Loan_Amount'.
5. LEAD SOURCE: Use "External Referral" if no source is mentioned. Choose from: External Referral, Employee Referral, Field Activity, Flyer, Hoardings.
6. LEAD STATUS: Strict dropdown values.

OUTPUT SCHEMA (JSON):
{
  "First_Name": "string or null",
  "Last_Name": "string",
  "Type_of_Customer": "Individual or Corporate",
  "Phone": "string or null",
  "Email": "string or null",
  "Occupation": "Salaried/Self-Employed/Business",
  "Monthly_Income": "numeric string",
  "Organisation": "string",
  "Company": "string",
  "Loan_Type": "string",
  "Requested_Loan_Amount": "numeric string",
  "Lead_Status": "Select from:
    - 'Attempted to Contact': Tried calling/emailing but no response.
    - 'Contact in Future': Spoke to them, but they requested a callback or follow-up later.
    - 'Contacted': Successfully held a direct conversation.
    - 'Junk Lead': Wrong number, spam, or zero interest.
    - 'Lost Lead': Spoke but they explicitly declined or went with a competitor.
    - 'Not Contacted': (Default) Lead data extracted but no contact attempt has been made yet.
    - 'Pre-Qualified': Spoke and they meet initial financial/loan criteria.
    - 'Not Qualified': Spoke but they do NOT meet eligibility criteria.",
  "Confidence_Score": 0-100,
  "Needs_Review": "Boolean",
  "Description": "Professional summary",
  "zoho_note": "Reasoning + Literal Transcript"
}
"""

def get_env_var(key):
    return os.getenv(key)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# AI Clients
def load_groq_client():
    try:
        return Groq(api_key=get_env_var("GROQ_API_KEY"))
    except: return None

# Removed Google Drive Logic - Attachments are now handled directly in Zoho

groq_client = load_groq_client()
openai_client = OpenAI(api_key=get_env_var("OPENAI_API_KEY"))
MEETING_MODEL = get_env_var("MODEL_ID") or "gpt-4o"

# ============================================================
# ZOHO PIPELINE ENGINE (Advanced Logic)
# ============================================================
async def push_to_zoho(transcript, filename=None):
    if not groq_client: return None
    try:
        
        # 1. AI Extraction (Senior Architect Mode)
        logger.info("Extracting Structured Intelligence from Transcript...")
        extract_res = groq_client.chat.completions.create(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT_EXTRACTION},
                {"role": "user", "content": f"TRANSCRIPT:\n{transcript}"}
            ],
            model="llama-3.3-70b-versatile",
            temperature=0,
            response_format={"type": "json_object"}
        )
        data = json.loads(extract_res.choices[0].message.content)
        
        # 2. Logic Mapping (AI Fields -> Zoho CRM Fields)
        needs_review = data.get("Needs_Review")
        base_status = data.get("Lead_Status") or "Not Contacted"
        
        # Lead Name Deduplication
        first_name = data.get("First_Name")
        last_name = data.get("Last_Name") or "Inquiry"
        
        # Robust Name Deduplication (handles "Name Name Name", "First Last Last")
        words = last_name.split()
        new_words = []
        for w in words:
            if not new_words or w.lower() != new_words[-1].lower():
                new_words.append(w)
        last_name = " ".join(new_words)

        # TO PREVENT "Karthik Karthik": If they match, we MUST set First_Name to "" (not None) 
        # to explicitly clear it in Zoho during the upsert.
        if first_name and last_name and first_name.strip().lower() == last_name.strip().lower():
            first_name = ""  # Force Clear in CRM
        elif not first_name:
            first_name = ""  # Also force clear if missing
        
        zoho_data = {
            "First_Name": first_name,
            "Last_Name": last_name,
            "Phone": data.get("Phone"),
            "Email": data.get("Email"),
            "Lead_Status": base_status,
            "Lead_Source": data.get("Lead_Source") or "External Referral",
            "Type_of_Customer": data.get("Type_of_Customer"),
            "Loan_Type": data.get("Loan_Type"),
            "Loan_Budget": data.get("Requested_Loan_Amount"),
            "Monthly_Income": data.get("Monthly_Income"),
            "Company": data.get("Organisation") or data.get("Company") or "Private Individual",
            "Description": f"CONFIDENCE: {data.get('Confidence_Score')}% | AUDIT: {'REVIEWS REQ' if needs_review else 'CLEAR'}\n\n{data.get('Description')}"
        }
        
        # Final Payload Cleanup
        allowed_fields = [
            "First_Name", "Last_Name", "Lead_Status", "Lead_Source", "Type_of_Customer", 
            "Loan_Type", "Monthly_Income", "Loan_Budget", "Description", "Phone", "Email", "Company"
        ]
        # USE "" instead of None for clearing fields in Zoho v7
        final_payload = {k: (v if v is not None else "") for k, v in zoho_data.items() if k in allowed_fields}
        logger.info(f"🚀 SYNCING TO ZOHO: {json.dumps(final_payload, indent=2)}")
        
        # 3. Secure Sync via MCP
        mcp_script = os.path.join(BASE_DIR, "alamaticz zoho mcp", "dist", "index.js")
        node_path = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
        
        server_params = StdioServerParameters(
            command=node_path, args=[mcp_script],
            env={
                **os.environ, 
                "ZOHO_CLIENT_ID": get_env_var("ZOHO_CLIENT_ID"), 
                "ZOHO_CLIENT_SECRET": get_env_var("ZOHO_CLIENT_SECRET"), 
                "ZOHO_REFRESH_TOKEN": get_env_var("ZOHO_REFRESH_TOKEN"), 
                "ZOHO_API_DOMAIN": get_env_var("ZOHO_API_DOMAIN") or "https://www.zohoapis.in",
                "ZOHO_ACCOUNTS_URL": get_env_var("ZOHO_ACCOUNTS_URL") or "https://accounts.zoho.in"
            }
        )

        async with stdio_client(server_params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                response = await session.call_tool("zohocrm_upsert_records", arguments={
                    "module": "Leads", "data": [final_payload], "duplicate_check_fields": ["Phone"]
                })
                try:
                    res_json = json.loads(response.content[0].text)
                    record_id = res_json.get("data", [{}])[0].get("details", {}).get("id")
                    
                    if record_id:
                        # Attach the ADVANCED STRATEGIC NOTE
                        await session.call_tool("zohocrm_create_records", arguments={
                            "module": "Notes", 
                            "data": [{
                                "Parent_Id": {"id": record_id}, 
                                "Note_Title": f"LEAD NEXUS ANALYSIS {datetime.now().strftime('%Y-%m-%d %H:%M')}", 
                                "Note_Content": data.get("zoho_note", transcript), 
                                "$se_module": "Leads"
                            }]
                        })
                        
                        # NEW: Attach the Original Audio File
                        if filename:
                            audio_path = os.path.join(BASE_DIR, "incoming", filename)
                            if os.path.exists(audio_path):
                                logger.info(f"Attaching Source Audio: {filename} to Record: {record_id}")
                                attach_res = await session.call_tool("zohocrm_upload_file", arguments={
                                    "module": "Leads", 
                                    "record_id": record_id, 
                                    "file_path": audio_path
                                })
                                logger.info(f"Attachment Response: {attach_res}")
                
                    return record_id
                except Exception as e:
                    logger.error(f"Post-Sync Error (Notes/Attachments): {e}")
                    return record_id # Return record_id even if attachment fails
    except Exception as e:
        logger.error(f"Zoho Sync Failed: {e}")
        return None

# ============================================================
# MEETING PIPELINE ENGINE
# ============================================================
def extract_text_from_doc(file_path):
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext == '.pdf':
        doc = fitz.open(file_path)
        return "\n".join([page.get_text() for page in doc])
    elif file_ext == '.docx':
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    return ""

def encode_image(image_path):
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode('utf-8')

async def extract_meeting_details_with_ai(file_path):
    file_ext = os.path.splitext(file_path)[1].lower()
    prompt = f"{SYSTEM_PROMPT_MEETING_EXTRACTION}\nToday is {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."
    
    messages = [{"role": "system", "content": "You are a specialized meeting analyst assistant. Extract details accurately."}]

    if file_ext in ['.jpg', '.jpeg', '.png']:
        base64_image = encode_image(file_path)
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        })
    else:
        text = extract_text_from_doc(file_path)
        if not text: return None
        messages.append({
            "role": "user",
            "content": f"{prompt}\n\nDocument Content:\n{text}"
        })

    try:
        response = await asyncio.to_thread(
            openai_client.chat.completions.create,
            model=MEETING_MODEL,
            messages=messages,
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        logger.error(f"AI Extraction Error: {e}")
        return None

async def push_meetings_to_zoho(meetings, original_filename=None):
    with open("sync_debug.log", "a") as f:
        f.write(f"{datetime.now()}: Pushing {len(meetings)} meetings to Zoho\n")
    logger.info(f"Pushing {len(meetings)} meetings to Zoho...")
    try:
        # Step 1: Prepare Environment
        zoho_env = {
            "ZOHO_CLIENT_ID": get_env_var("ZOHO_CLIENT_ID"), 
            "ZOHO_CLIENT_SECRET": get_env_var("ZOHO_CLIENT_SECRET"), 
            "ZOHO_REFRESH_TOKEN": get_env_var("ZOHO_REFRESH_TOKEN"), 
            "ZOHO_API_DOMAIN": get_env_var("ZOHO_API_DOMAIN") or "https://www.zohoapis.in",
            "ZOHO_ACCOUNTS_URL": get_env_var("ZOHO_ACCOUNTS_URL") or "https://accounts.zoho.in"
        }

        # Step 2: Set up MCP Server directly using Node
        mcp_script = os.path.join(BASE_DIR, "alamaticz zoho mcp", "dist", "index.js")
        node_path = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
        
        server_params = StdioServerParameters(
            command=node_path, 
            args=[mcp_script],
            env={**os.environ, **zoho_env}
        )

        results = []
        logger.info(f"Connecting to Zoho CRM via MCP: {node_path}")
        try:
            # Increase handshake timeout to 30s
            async with stdio_client(server_params) as (read, write):
                async with ClientSession(read, write) as session:
                    logger.info("Connecting to MCP Session...")
                    await asyncio.wait_for(session.initialize(), timeout=30.0)
                    
                    # 1. Prepare Batch Data
                    zoho_batch = []
                    for m_data in meetings:
                        title = m_data.get("Meeting_Title") or "AI Extracted Meeting"
                        
                        # Format description to include phone numbers explicitly
                        participants = m_data.get("Participants", [])
                        contact_info = ""
                        for p in participants:
                            if p.get("phone"):
                                contact_info += f"Contact: {p.get('name')} - {p.get('phone')}\n"
                        
                        full_description = f"{contact_info}\n{m_data.get('Description') or ''}".strip()

                        zoho_batch.append({
                            "Event_Title": title,
                            "Subject": title,
                            "Name1": m_data.get("Contact_Name") or "Unknown Contact",
                            "Start_DateTime": m_data.get("Start_DateTime"),
                            "End_DateTime": m_data.get("End_DateTime"),
                            "Description": full_description,
                            "Venue": m_data.get("Location") or "Not Specified",
                            "Host": "Capitabel Solutions",
                            "Host_Name": "Capitabel Solutions"
                        })

                    # 2. Single Batch Sync
                    logger.info(f"Syncing Batch of {len(zoho_batch)} meetings...")
                    response = await session.call_tool("zohocrm_create_records", {"module": "Events", "data": zoho_batch})
                    
                    try:
                        res_json = json.loads(response.content[0].text)
                        for i, rec_data in enumerate(res_json.get("data", [])):
                            title = zoho_batch[i]["Event_Title"]
                            if rec_data.get("status") == "success":
                                record_id = rec_data.get("id") or rec_data.get("details", {}).get("id")
                                
                                # Attach original file to each record in the batch
                                if original_filename:
                                    file_path = os.path.join(BASE_DIR, "incoming", original_filename)
                                    if os.path.exists(file_path):
                                        logger.info(f"Attaching file to record {record_id}...")
                                        await session.call_tool("zohocrm_upload_file", {
                                            "module": "Events", 
                                            "record_id": record_id, 
                                            "file_path": file_path
                                        })
                                
                                results.append({"subject": title, "success": True, "id": record_id})
                            else:
                                results.append({"subject": title, "success": False, "error": rec_data.get("message")})
                    except Exception as e:
                        logger.error(f"Batch response parsing error: {e}")
        except Exception as inner_e:
            with open("sync_debug.log", "a") as f:
                f.write(f"{datetime.now()}: MCP Startup Error: {str(inner_e)}\n")
            logger.error(f"MCP Startup Error: {inner_e}")
            raise inner_e 

        with open("sync_debug.log", "a") as f:
            f.write(f"{datetime.now()}: Sync Completed Successfully: {len(results)} records processed.\n")
        return results
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        with open("sync_debug.log", "a") as f:
            f.write(f"{datetime.now()}: Meeting Sync Failed (Outer):\n{error_detail}\n")
        logger.error(f"Meeting Sync Failed: {e}")
        return []

# ============================================================
# ENDPOINTS
# ============================================================
# ============================================================
# FRONTEND & STATIC FILES
# ============================================================
FRONTEND_DIST = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")

@app.get("/")
@app.head("/")
async def serve_index():
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"status": "online", "service": "CRM Pipeline API", "msg": "Frontend not found, but API is live"}

# Mount assets and other static files
if os.path.exists(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")
    # For any other static files in dist (favicon, etc)
    app.mount("/static", StaticFiles(directory=FRONTEND_DIST), name="static_root")

@app.post("/process-audio")
async def process_audio(file: UploadFile = File(...)):
    temp_path = f"incoming/{file.filename}"
    os.makedirs("incoming", exist_ok=True)
    with open(temp_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    
    with open(temp_path, "rb") as audio_file:
        # Stage 1: Advanced Whisper dictionary
        # Stage 1: Universal Translator Mode (Option B + C)
        raw_text = groq_client.audio.translations.create(
            file=(file.filename, audio_file.read()), 
            model="whisper-large-v3", 
            response_format="text",
            temperature=0,
            prompt="interest rate, EMI, ROI, income, loan amount, lead login"
        )
    
    logger.info(f"RAW WHISPER TEXT: {raw_text}")
    
    # Stage 2: Mechanical Eraser Cleaning
    clean_res = groq_client.chat.completions.create(
        messages=[{"role": "system", "content": SYSTEM_PROMPT_CLEANING}, {"role": "user", "content": raw_text}],
        model="llama-3.3-70b-versatile",
        temperature=0
    )
    clean_text = clean_res.choices[0].message.content.strip()

    # Note: Google Drive Archival removed - using Zoho Attachments
    
    return {"filename": file.filename, "transcript": clean_text}

class TranscriptSubmission(BaseModel):
    transcript: str
    filename: str

@app.post("/submit-to-zoho")
async def final_submit(sub: TranscriptSubmission):
    # Archiving local copy
    txt_path = f"verified_transcripts/final_{int(datetime.now().timestamp())}.txt"
    os.makedirs("verified_transcripts", exist_ok=True)
    with open(txt_path, "w", encoding="utf-8") as f: f.write(sub.transcript)
    
    # Note: Google Drive Archival removed - using Zoho Attachments
    
    # Zoho Push
    zoho_id = await push_to_zoho(sub.transcript, sub.filename)
    if zoho_id:
        return {"status": "success", "msg": f"Lead created in Zoho! ID: {zoho_id}"}
    return {"status": "error", "msg": "Archives saved locally, but Zoho push failed."}

@app.post("/process-meeting")
async def process_meeting(file: UploadFile = File(...)):
    temp_path = f"incoming/{file.filename}"
    os.makedirs("incoming", exist_ok=True)
    with open(temp_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    
    extracted = await extract_meeting_details_with_ai(temp_path)
    if not extracted or "meetings" not in extracted:
        return {"filename": file.filename, "meetings": [], "error": "No meetings found"}
    
    # Note: Google Drive Archival removed - using Zoho Attachments
    
    return {"filename": file.filename, "meetings": extracted["meetings"]}

class MeetingSubmission(BaseModel):
    meetings: list
    filename: Optional[str] = None

@app.post("/sync-meetings")
async def sync_meetings(sub: MeetingSubmission):
    # Sort meetings chronologically by parsing the ISO strings
    try:
        # Use ISO string sorting (YYYY-MM-DD) which is reliable
        sub.meetings.sort(key=lambda x: x.get("Start_DateTime", ""))
        logger.info("--- CHRONOLOGICAL SYNC ORDER ---")
        for i, m in enumerate(sub.meetings):
            logger.info(f"{i+1}. {m.get('Start_DateTime')} - {m.get('Contact_Name')}")
        logger.info("-------------------------------")
    except Exception as e:
        logger.error(f"Sorting failed: {e}")
        
    results = await push_meetings_to_zoho(sub.meetings, sub.filename)
    return {"status": "success", "results": results}

@app.exception_handler(404)
async def spa_fallback_handler(request: Request, exc: HTTPException):
    # Check if it's an API request
    if request.url.path.startswith("/process") or request.url.path.startswith("/submit") or request.url.path.startswith("/sync"):
        return JSONResponse(status_code=404, content={"detail": exc.detail})
    
    # Fallback to frontend index.html for SPA
    index_path = os.path.join(FRONTEND_DIST, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return JSONResponse(status_code=404, content={"detail": exc.detail})

if __name__ == "__main__":
    import uvicorn
    # 🏎️ AUTO-RELOAD ENABLED FOR THE ARCHITECT
    uvicorn.run("main_api:app", host="0.0.0.0", port=8000, reload=True)
