import os
from typing import Optional
from dotenv import load_dotenv
import json
import logging
import shutil
import asyncio
import hashlib
import signal
import sys
from datetime import datetime

# Graceful Shutdown Handler
def handle_exit(sig, frame):
    print("\nForce Quitting Backend...")
    sys.exit(0)

signal.signal(signal.SIGINT, handle_exit)
signal.signal(signal.SIGTERM, handle_exit)
from fastapi import FastAPI, UploadFile, File, Form, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from groq import Groq
from openai import OpenAI
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
You are a transcript cleaning tool for real estate home loan sales field call recordings.
These transcripts have been translated from Tamil/Telugu/Hindi/Kannada to English by Whisper AI.
The translation may sound broken or unnatural — that is expected. Do NOT fix it.

YOUR ONLY JOB: Remove filler words. Nothing else.

⚠️ ANTI-TRUNCATION MANDATE (HIGHEST PRIORITY):
The speaker ALWAYS ends with a CRM action instruction (e.g. "capture this in CRM", "take this for further").
You MUST preserve every single word until the absolute last syllable.
If the final sentence sounds incomplete, still include it exactly as heard.
NEVER drop, rephrase, or shorten the last sentence — it contains critical business instructions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REMOVE ONLY THESE FILLER WORDS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- English fillers : um, uh, ah, oh, hmm
- Indian fillers  : haan, acha, arre, bas, achha
- Repetitions     : "okay okay", "yeah yeah", "so so", "like like"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NEVER TOUCH THESE — EVER:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Numbers         : phone numbers, flat numbers, floor numbers
- Money amounts   : "45 lakhs", "1.2 crore", "50K", "budget is 80"
- Names           : customer names, agent names, place names
- Loan terms      : "loan", "EMI", "down payment", "finance", "pre-approved"
- Property terms  : "BHK", "villa", "plot", "site visit", "possession"
- Locations       : any city, area, landmark, or project name
- CRM instructions: "capture in CRM", "take up for further", "login", any action item

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
INDUSTRY TERM CORRECTIONS (MANDATORY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- If you see the word "civil" used in the context of loans, credit, or records (e.g., "check their civil", "civil score"), you MUST correct it to "CIBIL". 
- If you see the phrase "newly login" or similar phrases about logging in a new file/customer, you MUST correct it strictly to "new lead login".
- Do not make any other vocabulary changes unless specified here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. DO NOT rephrase or reword any sentence — even if it sounds broken or ungrammatical.
   BAD  → "I need loan" becomes "I need a loan"   ← forbidden, adds "a"
   GOOD → "I need loan"                            ← leave exactly as-is

2. DO NOT fix grammar, punctuation, or sentence structure.

3. DO NOT add ANY words that were not in the original transcript.
   This includes: "Thank you", "Goodbye", "Sure", "Of course", or any closing phrase.

4. DO NOT summarize, shorten, or combine sentences.

5. The LAST SENTENCE is sacred — return it word-for-word as it appears.
   BAD  → "Capture this information in CRM so we can take up this for further" becomes "We can take this information from CRM" ← forbidden, rephrased + truncated
   GOOD → "Capture this information in CRM so we can take up this for further" ← exact copy, even if incomplete

6. If the transcript is 1–2 words, you MUST still return the cleaned version. Never refuse.

7. If NO fillers are found, return the transcript COMPLETELY UNCHANGED.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT RULE:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY the cleaned transcript.
No explanations. No notes. No labels. Nothing else.
"""

SYSTEM_PROMPT_MEETING_EXTRACTION = """
You are a strict JSON extraction agent for Capital Solution company field work reports.
Your ONLY job is to extract data from Excel rows and return a valid JSON object.

## STEP 1 — HEADER SCAN (do this BEFORE any extraction):
- Read the first non-empty row as the header row
- Map each column to its logical field using the COLUMN MAPPING below
- Never assume a fixed column position (A, B, C...) — always go by column name
- If a column does not match any known variation → ignore it

## COLUMN MAPPING (match any of these variations, case-insensitive):
- SN       → "SN", "S.No", "S No", "Serial", "No", "#"
- Title    → "Title", "Type", "Meeting Type", "Category"
- Name     → "Name", "Person Name", "Client Name", "Customer Name", "Contact Name"
- Phone    → "Phone Number", "Phone No", "Phone", "Mobile", "Mobile No",
             "Cell No", "Contact No", "Contact Number", "Ph No", "Ph"
- Location → "Area / Location", "Area", "Location", "Place", "Region", "Area/Location"
- Staff    → "Staff", "Staff Name", "Employee", "Agent", "Field Agent", "Representative"
- Date     → "Date", "Meeting Date", "Visit Date", "Day"
- TimeFrom → "Time From", "From", "Start Time", "Start", "Time Start"
- TimeTo   → "Time To", "To", "End Time", "End", "Time End"
- Note     → "Note", "Notes", "Remarks", "Comments", "Description", "Remark"

## IF A COLUMN IS NOT FOUND IN THE SHEET:
- Title not found     → default to "Field Meeting"
- Name not found      → skip the row entirely
- Phone not found     → set phone to null
- Location not found  → set location to null
- Staff not found     → set staff to "Unknown"
- Date not found      → skip the row entirely
- TimeFrom not found  → set "from" to "[DATE]T00:00:00"
- TimeTo not found    → set "to" to "[DATE]T00:00:00"
- Note not found      → use "Contact: [phone]" as description

## SKIP RULES:
- **Rule 1:** Extract EVERY SINGLE row from the document. Do NOT stop early.
- **Rule 2:** If there are 7 rows in the Excel, you MUST return 7 meeting objects.
- **Rule 3:** Only skip a row if the Name or Date is completely blank.
- Never include empty/blank rows in the output.

## TITLE RULES:
- Use the value from the mapped Title column exactly as given
- If the Title column is empty for a row → use "Field Meeting"
- NEVER use the Note column value as the title

## NAME RULES:
- Use the value from the mapped Name column exactly as given
- Fix capitalization (e.g. "akash" → "Akash", "VASIM" → "Vasim")
- If Name is empty → skip this row entirely

## PHONE RULES:
- Use the value from the mapped Phone column
- Remove all spaces (e.g. "70324 67794" → "7032467794")
- Keep the +91 prefix if present, but remove spaces (e.g. "+91 73867 54137" → "+917386754137")
- If Phone is empty → set to null

## HOST RULES:
- Always set to "Capital Solution" for every single entry
- No exceptions, never change this value

## Area/Location RULES:
- Use the value from the mapped Area/Location column
- Capitalize properly (e.g. "NAIDUPETA" → "Naidupeta", "sulurupeta" → "Sulurupeta")
- If Location is empty → set to null

## ⚠️ CRITICAL — DATE/TIME RULES:
- The Date column contains the actual date for EACH ROW — read it per row
- Do NOT assume all rows share the same date
- Do NOT use today's date under any circumstances
- Do NOT hardcode any date
- Date may appear in formats like "23-04-2026", "2026-04-23", "23/04/2026" — parse all correctly
- Time From and Time To are in H:MM or HH:MM format (e.g. "9:40", "10:02", "11:30")
- Combine Date + Time From → "from" field in ISO 8601 format
- Combine Date + Time To   → "to" field in ISO 8601 format
- Output format: "YYYY-MM-DDTHH:MM:00"
- Example: Date="23-04-2026", Time From="9:40" → "from": "2026-04-23T09:40:00"
- If Date is empty for a row → skip that row

## STAFF RULES:
- Use the value from the mapped Staff column exactly as given
- Fix capitalization if needed (e.g. "narendra" → "Narendra")
- If Staff is empty → use "Unknown"

## DESCRIPTION RULES:
- Format: "[Note value]. Contact: [phone]"
- Example: "Customer. Contact: 7032467794"
- If Note is empty but phone exists → use "Contact: [phone]"
- If both Note and Phone are empty → use "No additional details"
- NEVER use Note content as the title

## OUTPUT RULES:
- Return ONLY a valid JSON object with key "meetings" containing an array
- No markdown, no code blocks, no explanation, no extra text before or after
- Every entry must have exactly these 9 fields: title, from, to, name, phone, host, location, description, staff
- Preserve the original row order (by SN)

## OUTPUT FORMAT:
{
  "meetings": [
    {
      "title": "Field Meeting",
      "from": "2026-04-23T09:40:00",
      "to": "2026-04-23T10:02:00",
      "name": "Akash",
      "phone": "7032467794",
      "host": "Capital Solution",
      "location": "Naidupeta",
      "description": "Customer. Contact: 7032467794",
      "staff": "Narendra"
    }
  ]
}

## ✅ VALIDATION CHECKLIST — verify before returning output:
[ ] Header scan completed and columns mapped correctly
[ ] Every row with a valid Name and Date is included
[ ] No empty or blank rows are included
[ ] Each "from" and "to" uses the Date from THAT specific row
[ ] No date is today's date or any hardcoded date
[ ] Phone numbers have no spaces
[ ] +91 prefix preserved where present, with no spaces
[ ] Location is properly capitalized
[ ] All 9 fields are present in every entry
[ ] Output is pure JSON only — no markdown, no extra text
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
   - If the name is completely unknown, but the transcript mentions a reference or referral source (e.g. "referred by Ashok"), set Last_Name to "Unknown (Ashok)". 
   - If NO name and NO reference are found, use a key identifier from the transcript in brackets, such as their profession, location, or loan requirement (e.g., "Unknown (Doctor from Delhi)", "Unknown (Seeking 30L PL)"). Do NOT just use "Unknown".
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
  "Lead_Status": "Available statuses:
    - 'New': FIRST CRM ENTRY. Lead is just being logged into the CRM for the first time (e.g., 'new lead login'). Even if requirements are mentioned, if it is the very first CRM logging event without PD/Processing, it MUST be New.
    - 'Enquiry': Conversation already happened and requirements discussed, but NO processing or PD has started.
    - 'In-Progress': PD (Personal Discussion) completed OR documents collected OR loan processing/eligibility check has actively started.
    - 'Cold': Customer delays decision or asks to follow up later.
    - 'Not Qualified': Customer fails eligibility criteria (CIBIL, income, FOIR, policy rejection).
    - 'Junk': Spam, invalid lead, wrong number, or no business intent.
    FINAL PRODUCTION RULES (DECISION TREE):
    1. First time entry into CRM (e.g., 'new lead login', 'capture this info') -> MUST be 'New'.
    2. Requirement discussion done but NOT first entry -> MUST be 'Enquiry'.
    3. PD (Personal discussion) done or processing actively started -> MUST be 'In-Progress'.
    4. Override any agent-provided status if it contradicts this decision tree.
    5. Choose ONLY ONE correct status.",
  "Confidence_Score": 0-100,
  "Needs_Review": "Boolean",
  "Description": "Professional summary",
  "zoho_note": "Reasoning + Literal Transcript"
}
"""

def get_env_var(key):
    return os.getenv(key)

app = FastAPI()
origins = [
    "https://crm-leads-meetings-automation-hub.netlify.app",
    "https://crm-pipeline-leads-meetings-automati.netlify.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://localhost:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
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
# UTILS
# ============================================================
HASH_REGISTRY_FILE = os.path.join(BASE_DIR, "processed_hashes.json")

def calculate_file_hash(file_content):
    return hashlib.md5(file_content).hexdigest()

def is_file_duplicate(file_hash):
    if not os.path.exists(HASH_REGISTRY_FILE):
        return False
    try:
        with open(HASH_REGISTRY_FILE, "r") as f:
            hashes = json.load(f)
            return file_hash in hashes
    except:
        return False

def register_file_hash(file_hash, filename, extraction_data=None):
    try:
        hashes = {}
        if os.path.exists(HASH_REGISTRY_FILE):
            with open(HASH_REGISTRY_FILE, "r") as f:
                hashes = json.load(f)
        
        hashes[file_hash] = {
            "filename": filename,
            "timestamp": datetime.now().isoformat(),
            "extracted_data": extraction_data
        }
        
        with open(HASH_REGISTRY_FILE, "w") as f:
            json.dump(hashes, f, indent=2)
    except Exception as e:
        logger.error(f"Error registering hash: {e}")

def extract_staff_from_filename(filename):
    """
    Extracts staff name from filename pattern like 'field activity_29-04-26_narendra.pdf'
    Returns the last part before the extension if underscores are present.
    """
    if not filename:
        return ""
    try:
        # Remove extension and get basename
        name_no_ext = os.path.splitext(os.path.basename(filename))[0]
        if "_" in name_no_ext:
            parts = name_no_ext.split("_")
            if len(parts) >= 2:
                # Typically format is description_date_staff or activity_staff
                staff_name = parts[-1].strip()
                # Simple check: if it's a date-like string (contains hyphens/slashes), it might not be the name
                # but the user's example shows narendra at the end.
                return staff_name.capitalize()
    except Exception as e:
        logger.error(f"Error extracting staff from filename: {e}")
    return ""

# ============================================================
# ZOHO PIPELINE ENGINE (Advanced Logic)
# ============================================================
async def push_to_zoho(transcript, filename=None, staff=None):
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
            response_format={"type": "json_object"},
            timeout=20.0  # Added strict timeout
        )
        data = json.loads(extract_res.choices[0].message.content)
        
        # 2. Logic Mapping (AI Fields -> Zoho CRM Fields)
        needs_review = data.get("Needs_Review")
        base_status = data.get("Lead_Status") or "New"
        
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
            "Staff": staff or extract_staff_from_filename(filename),
            "Description": f"CONFIDENCE: {data.get('Confidence_Score')}% | AUDIT: {'REVIEWS REQ' if needs_review else 'CLEAR'}\n\n{data.get('Description')}"
        }
        
        # Final Payload Cleanup
        allowed_fields = [
            "First_Name", "Last_Name", "Lead_Status", "Lead_Source", "Type_of_Customer", 
            "Loan_Type", "Monthly_Income", "Loan_Budget", "Description", "Phone", "Email", "Company", "Staff"
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
                await asyncio.wait_for(session.initialize(), timeout=15.0) # Added timeout
                response = await asyncio.wait_for(session.call_tool("zohocrm_upsert_records", arguments={
                    "module": "Leads", "data": [final_payload], "duplicate_check_fields": ["Phone"]
                }), timeout=20.0) # Added timeout
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
    if file_ext in ['.xlsx', '.xls']:
        try:
            import pandas as pd
            # Force all columns to be read as strings to prevent date/number shifting
            df = pd.read_excel(file_path, dtype=str)
            raw_json = df.to_json(orient='records')
            with open("sync_debug.log", "a") as f:
                f.write(f"[DEBUG] Raw Excel Data: {raw_json[:500]}...\n")
            return raw_json
        except Exception as e:
            logger.error(f"Excel reading error: {e}")
            return ""

    return ""


async def extract_meeting_details_with_ai(file_path):
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext not in ['.xlsx', '.xls']:
        logger.warning(f"Unsupported file type for meetings: {file_ext}. Only Excel is supported.")
        return None

    prompt = f"{SYSTEM_PROMPT_MEETING_EXTRACTION}\nToday is {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}."
    text = extract_text_from_doc(file_path)
    if not text: return None
    
    messages = [
        {"role": "system", "content": "You are a specialized Excel data analyst. Extract all rows into JSON accurately."},
        {"role": "user", "content": f"{prompt}\n\nExcel Content (JSON Format):\n{text}"}
    ]


    try:
        logger.info(f"Using OpenAI Vision/Chat ({MEETING_MODEL}) for extraction...")
        response = openai_client.chat.completions.create(
            model=MEETING_MODEL,
            messages=messages,
            response_format={"type": "json_object"}
        )
        raw_content = response.choices[0].message.content
        with open("sync_debug.log", "a") as f:
            f.write(f"\n[DEBUG] AI RAW RESPONSE: {raw_content}\n")
        logger.info(f"AI RAW RESPONSE: {raw_content}")
        return json.loads(raw_content)



    except asyncio.TimeoutError:
        logger.error("AI Extraction Error: Request timed out after 180s")
        return None
    except Exception as e:
        import traceback
        logger.error(f"AI Extraction Error: {str(e)}")
        logger.error(traceback.format_exc())
        return None

async def push_to_zoho(transcript, original_filename=None, staff=None):
    final_payload = {
        "Last_Name": "Lead from CRM Hub", "First_Name": "AI Processed",
        "Company": "Capital Solution", "Description": transcript, "Lead_Source": "AI Automation Hub"
    }
    if staff: final_payload["Staff_Name"] = staff

    zoho_env = {
        "ZOHO_CLIENT_ID": get_env_var("ZOHO_CLIENT_ID"), 
        "ZOHO_CLIENT_SECRET": get_env_var("ZOHO_CLIENT_SECRET"), 
        "ZOHO_REFRESH_TOKEN": get_env_var("ZOHO_REFRESH_TOKEN"), 
        "ZOHO_API_DOMAIN": get_env_var("ZOHO_API_DOMAIN") or "https://www.zohoapis.in",
        "ZOHO_ACCOUNTS_URL": get_env_var("ZOHO_ACCOUNTS_URL") or "https://accounts.zoho.in"
    }
    mcp_script = os.path.join(BASE_DIR, "alamaticz zoho mcp", "dist", "index.js")
    node_path = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
    server_params = StdioServerParameters(command=node_path, args=[mcp_script], env={**os.environ, **zoho_env})

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=30.0)
                response = await asyncio.wait_for(session.call_tool("zohocrm_upsert_records", arguments={
                    "module": "Leads", "data": [final_payload], "duplicate_check_fields": ["Phone"]
                }), timeout=20.0) 
                try:
                    res_json = json.loads(response.content[0].text)
                    return res_json.get("data", [{}])[0].get("details", {}).get("id")
                except: return None
    except Exception as e:
        logger.error(f"Zoho Lead Sync Failed: {e}")
        return None


async def push_meetings_to_zoho(meetings, original_filename=None, staff=None):
    results = []
    total = len(meetings)
    try:
        # Use Local MCP Server for Stability
        zoho_env = {
            "ZOHO_CLIENT_ID": get_env_var("ZOHO_CLIENT_ID"), 
            "ZOHO_CLIENT_SECRET": get_env_var("ZOHO_CLIENT_SECRET"), 
            "ZOHO_REFRESH_TOKEN": get_env_var("ZOHO_REFRESH_TOKEN"), 
            "ZOHO_API_DOMAIN": get_env_var("ZOHO_API_DOMAIN") or "https://www.zohoapis.in",
            "ZOHO_ACCOUNTS_URL": get_env_var("ZOHO_ACCOUNTS_URL") or "https://accounts.zoho.in"
        }
        mcp_script = os.path.join(BASE_DIR, "alamaticz zoho mcp", "dist", "index.js")
        node_path = shutil.which("node") or r"C:\Program Files\nodejs\node.exe"
        server_params = StdioServerParameters(command=node_path, args=[mcp_script], env={**os.environ, **zoho_env})

        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await asyncio.wait_for(session.initialize(), timeout=45.0)
                
                zoho_batch = []
                for i, m_data in enumerate(meetings):

                    # Yield progress update for each meeting lookup
                    yield json.dumps({
                        "type": "progress", 
                        "current": i + 1, 
                        "total": total, 
                        "name": m_data.get("name") or m_data.get("Contact_Name", "Unknown")
                    }) + "\n"
                    
                    title = m_data.get("title") or m_data.get("Meeting_Title") or "Field Meeting"
                    contact_name = m_data.get("name") or m_data.get("Contact_Name") or "Unknown Contact"
                    start_time = m_data.get("from") or m_data.get("Start_DateTime")
                    end_time = m_data.get("to") or m_data.get("End_DateTime")
                    location = m_data.get("location") or m_data.get("Location") or "Not Specified"
                    contact_phone = m_data.get("phone") or m_data.get("Phone") or ""
                    base_desc = m_data.get("description") or m_data.get("Description") or ""
                    description = f"{base_desc}. Contact: {contact_phone}" if contact_phone else base_desc
                    host = m_data.get("host") or "Capital Solution"

                    who_id = None
                    if contact_phone and str(contact_phone).strip() not in ["", "null", "None", "0000000000"]:
                        clean_phone = "".join(filter(str.isdigit, str(contact_phone)))
                        search_val = clean_phone[-10:] if len(clean_phone) >= 10 else clean_phone
                        
                        try:
                            criteria = f"((Mobile:equals:'{search_val}')or(Phone:equals:'{search_val}'))"
                            search_res = await asyncio.wait_for(session.call_tool("zohocrm_search_records", {
                                "module": "Contacts", "criteria": criteria
                            }), timeout=15.0)

                            raw_text = search_res.content[0].text if search_res.content else ""
                            search_data = json.loads(raw_text) if raw_text.startswith("{") else {"data": []}

                            if isinstance(search_data, dict) and search_data.get("data"):
                                matched_contact = search_data["data"][0]
                                who_id = {"id": matched_contact["id"], "name": matched_contact.get("Full_Name")}
                        except: pass

                    # Smart-Fix for Meeting Times
                    try:
                        from datetime import datetime, timedelta
                        s_dt = datetime.fromisoformat(start_time)
                        e_dt = datetime.fromisoformat(end_time)
                        if e_dt <= s_dt:
                            logger.info(f"Smart-Fix: Adjusting end time for {contact_name}")
                            end_time = (s_dt + timedelta(minutes=30)).isoformat()
                    except: pass

                    event_payload = {
                        "Event_Title": title, "Subject": title,
                        "Start_DateTime": start_time, "End_DateTime": end_time,
                        "Description": description, "Venue": location,
                        "Host": host, "Staff": staff or extract_staff_from_filename(original_filename),
                        "Contact_Name_Raw": contact_name # Passing through for reporting
                    }

                    if who_id:
                        event_payload["Who_Id"] = who_id
                        event_payload["$se_module"] = "Contacts"

                    zoho_batch.append(event_payload)

                # Batch Sync
                yield json.dumps({"type": "info", "msg": "Finalizing Sync in Zoho..."}) + "\n"
                response = await asyncio.wait_for(session.call_tool("zohocrm_create_records", {"module": "Events", "data": zoho_batch}), timeout=60.0)
                
                try:
                    raw_text = response.content[0].text if response.content else ""
                    logger.info(f"Zoho Raw Response: {raw_text[:200]}...") 
                    
                    if not raw_text:
                        logger.error("Zoho returned an empty response.")
                        yield json.dumps({"type": "error", "msg": "Zoho returned an empty response."}) + "\n"
                        return

                    if not raw_text.strip().startswith("{"):
                        logger.error(f"Zoho returned a non-JSON error: {raw_text}")
                        yield json.dumps({"type": "error", "msg": f"Zoho API Error: {raw_text}"}) + "\n"
                        return

                    res_json = json.loads(raw_text)
                    
                    # Handle case where Zoho returns an error object instead of a data array
                    if "data" not in res_json:
                        error_msg = res_json.get("message") or "Unknown Zoho Error"
                        logger.error(f"Zoho Error Object: {res_json}")
                        yield json.dumps({"type": "error", "msg": f"Zoho Error: {error_msg}"}) + "\n"
                        return

                    for i, rec_data in enumerate(res_json.get("data", [])):
                        m_original = zoho_batch[i]
                        title = m_original["Event_Title"]
                        c_name = m_original.get("Contact_Name_Raw", "Unknown")
                        
                        if rec_data.get("status") == "success":
                            record_id = rec_data.get("id") or rec_data.get("details", {}).get("id")
                            results.append({"subject": title, "name": c_name, "success": True, "id": record_id})
                        else:
                            error_msg = rec_data.get("message") or "Zoho API Error"
                            results.append({"subject": title, "name": c_name, "success": False, "error": error_msg})

                except Exception as e:
                    logger.error(f"Batch parse error: {e}")
                    if 'raw_text' in locals():
                        logger.error(f"Raw text that failed to parse: {raw_text}")
                    yield json.dumps({"type": "error", "msg": f"Sync failed during parsing: {str(e)}"}) + "\n"

        # Final Result
        yield json.dumps({"type": "result", "results": results}) + "\n"
    except Exception as e:
        logger.error(f"Sync error: {e}")
        yield json.dumps({"type": "error", "msg": str(e)}) + "\n"



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
    content = await file.read()
    file_hash = calculate_file_hash(content)
    
    if is_file_duplicate(file_hash):
        return JSONResponse(
            status_code=400, 
            content={"error": "DUPLICATE_FILE", "msg": "This file has already been processed and synced to Zoho."}
        )

    with open(temp_path, "wb") as buffer: buffer.write(content)
    
    # Stage 1: Universal Translator Mode (Option B + C)
    raw_text = groq_client.audio.translations.create(
        file=(file.filename, content), 
        model="whisper-large-v3", 
        response_format="text",
        temperature=0
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
    staff = extract_staff_from_filename(file.filename)
    
    return {"filename": file.filename, "transcript": clean_text, "staff": staff}

class TranscriptSubmission(BaseModel):
    transcript: str
    filename: str
    staff: Optional[str] = None

@app.post("/submit-to-zoho")
async def final_submit(sub: TranscriptSubmission):
    # Archiving local copy
    txt_path = f"verified_transcripts/final_{int(datetime.now().timestamp())}.txt"
    os.makedirs("verified_transcripts", exist_ok=True)
    with open(txt_path, "w", encoding="utf-8") as f: f.write(sub.transcript)
    
    # Note: Google Drive Archival removed - using Zoho Attachments
    
    # Zoho Push
    zoho_id = await push_to_zoho(sub.transcript, sub.filename, sub.staff)
    if zoho_id:
        # Register hash only on successful Zoho sync
        try:
            temp_path = f"incoming/{sub.filename}"
            if os.path.exists(temp_path):
                with open(temp_path, "rb") as f:
                    file_hash = calculate_file_hash(f.read())
                    register_file_hash(file_hash, sub.filename)
        except: pass
        
        return {"status": "success", "msg": f"Lead created in Zoho! ID: {zoho_id}"}
    return {"status": "error", "msg": "Archives saved locally, but Zoho push failed."}

async def meeting_processing_stream(file: UploadFile):
    temp_path = f"incoming/{file.filename}"
    os.makedirs("incoming", exist_ok=True)
    
    yield json.dumps({"type": "progress", "percent": 2, "msg": "Waking up AI..."}) + "\n"
    await asyncio.sleep(0.3)
    yield json.dumps({"type": "progress", "percent": 12, "msg": "Uploading document..."}) + "\n"
    content = await file.read()
    with open(temp_path, "wb") as buffer: buffer.write(content)
    await asyncio.sleep(0.3)
    
    yield json.dumps({"type": "progress", "percent": 28, "msg": "Scanning Excel rows..."}) + "\n"
    await asyncio.sleep(0.4)
    
    yield json.dumps({"type": "progress", "percent": 48, "msg": "Extracting Meeting Intelligence..."}) + "\n"
    extracted = await extract_meeting_details_with_ai(temp_path)
    
    if not extracted or "meetings" not in extracted:
        yield json.dumps({"type": "error", "msg": "No meetings found in file"}) + "\n"
        return

    yield json.dumps({"type": "progress", "percent": 82, "msg": "Filtering data literal truths..."}) + "\n"
    await asyncio.sleep(0.3)
    yield json.dumps({"type": "progress", "percent": 96, "msg": "Finalizing Review..."}) + "\n"
    
    frontend_meetings = []

    top_staff = extract_staff_from_filename(file.filename)
    
    for m in extracted["meetings"]:
        meeting_staff = m.get("staff") or top_staff or ""
        frontend_meetings.append({
            "Meeting_Title": m.get("title") or "Field Meeting",
            "Contact_Name": m.get("name") or m.get("Contact_Name") or "Unknown Contact",
            "phone": str(m.get("phone") or m.get("Phone") or "").strip(),
            "Start_DateTime": m.get("from"),
            "End_DateTime": m.get("to"),
            "Location": m.get("location"),
            "Description": m.get("description"),
            "Staff": meeting_staff
        })


    
    yield json.dumps({"type": "progress", "percent": 100, "msg": "Ready!"}) + "\n"
    yield json.dumps({
        "type": "result", 
        "filename": file.filename, 
        "meetings": frontend_meetings, 
        "staff": top_staff
    }) + "\n"

@app.post("/process-meeting")
async def process_meeting(file: UploadFile = File(...)):
    from fastapi.responses import StreamingResponse
    return StreamingResponse(meeting_processing_stream(file), media_type="text/event-stream")

class MeetingSubmission(BaseModel):
    meetings: list
    filename: Optional[str] = None
    staff: Optional[str] = None

@app.post("/sync-meetings")
async def sync_meetings(sub: MeetingSubmission):
    from fastapi.responses import StreamingResponse
    
    # Sort meetings chronologically
    try:
        sub.meetings.sort(key=lambda x: x.get("Start_DateTime", ""))
    except: pass
        
    return StreamingResponse(
        push_meetings_to_zoho(sub.meetings, sub.filename, sub.staff),
        media_type="text/event-stream"
    )


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
    # PRODUCTION / LOCAL CONFIG
    # Port will be dynamically assigned by Render, or default to 9002 locally
    port = int(os.environ.get("PORT", 9002))
    # Host needs to be 0.0.0.0 for Render to expose the service to the internet
    host = "0.0.0.0"
    
    uvicorn.run(
        "main_api:app", 
        host=host, 
        port=port, 
        reload=False
    )
