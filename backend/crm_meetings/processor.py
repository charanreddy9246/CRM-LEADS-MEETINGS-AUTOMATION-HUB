import os
import json
import asyncio
import base64
from openai import OpenAI
from datetime import datetime
from dotenv import load_dotenv
import fitz  # PyMuPDF for PDF
from docx import Document  # for Word
from PIL import Image
import io
import time

# MCP Client Imports
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Load environment variables
load_dotenv()

# Configure OpenAI Client
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)
MODEL_ID = os.getenv("MODEL_ID", "gpt-4o")

# MCP Server Config
MCP_SERVER_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "alamaticz zoho mcp", "dist", "index.js"))

# MCP Helper to call your Zoho tools
async def call_zoho_tool(session, tool_name, arguments):
    print(f"Calling MCP Tool: {tool_name}")
    result = await session.call_tool(tool_name, arguments)
    if result.isError:
        print(f"❌ MCP Error: {result.content}")
        return None
    
    raw_content = ""
    if result.content and len(result.content) > 0:
        raw_content = result.content[0].text

    try:
        if not raw_content: return {}
        return json.loads(raw_content)
    except Exception:
        return raw_content

# Search Contact via MCP (Search by Name)
async def search_contact_via_mcp(session, name):
    if name:
        print(f"[SEARCH] Searching contact by name: {name}")
        results = await call_zoho_tool(session, "zohocrm_search_records", {
            "module": "Contacts",
            "word": name
        })
        if results and isinstance(results, dict) and results.get("data"):
            # Only return the first ID found
            return results["data"][0].get("id")
    return None

# Create Meeting via MCP
async def create_meeting_via_mcp(session, meeting_data, original_file_path=None):
    # Variables must be defined before use
    contact_name = meeting_data.get("Contact_Name") or "Unknown Contact"
    venue = meeting_data.get("Location") or "Not Specified"
    title = meeting_data.get("Meeting_Title") or "AI Extracted Meeting"
    notes = meeting_data.get("Description") or ""

    # Format the simple description
    final_description = f"{notes}"

    # Construct a clean activity title
    # Fallback to 'AI Extracted Meeting' if no meaningful title is found
    # Type safety: Convert to string to avoid crashes if AI returns a non-string value
    title_str = str(title) if title else ""
    bad_titles = ["AI EXTRACTED MEETING", "CUSTOMER", "NOTE", "N/A", "UNKNOWN", ""]
    full_title = title_str if title_str and title_str.upper() not in bad_titles else "AI Extracted Meeting"

    # Try to find existing contact to link
    contact_id = await search_contact_via_mcp(session, contact_name)

    zoho_event = {
        "Event_Title": full_title,       # Strictly the activity title
        "Subject": full_title,           # Consistent title
        "Name1": contact_name,           # Fill the new custom column
        "Start_DateTime": meeting_data.get("Start_DateTime"),
        "End_DateTime": meeting_data.get("End_DateTime"),
        "Description": final_description,
        "Venue": venue,
        "Host": "Capitabel Solutions",
        "Host_Name": "Capitabel Solutions"
    }

    # Link Contact ONLY if they exist (prevents accidental contact creation)
    if contact_id:
        zoho_event["Who_Id"] = {"id": contact_id}
        print(f"[LINK] Linked to Contact ID: {contact_id}")
    else:
        print(f"[WARN] No contact found in Zoho for '{contact_name}'. Skipping link.")

    # Send meeting to Zoho
    # Robust response handling to prevent 500 crashes
    print(f"[SEND] Sending meeting to Zoho for {contact_name}...")
    print(f"DEBUG: Event Data: {json.dumps(zoho_event, indent=2)}")
    
    try:
        result = await call_zoho_tool(session, "zohocrm_create_records", {
            "module": "Events",
            "data": [zoho_event]
        })
    except Exception as e:
        print(f"[ERR] Exception calling MCP tool: {e}")
        return {"success": False, "error": f"MCP Tool Crash: {str(e)}"}
    
    if not result:
        return {"success": False, "error": "No response from Zoho MCP"}

    # If Zoho returned a string (usually an API error message)
    if isinstance(result, str):
        return {"success": False, "error": f"Zoho API Error: {result}"}

    # If Zoho returned a standard JSON structure
    if isinstance(result, dict) and "data" in result:
        res_data = result.get("data", [{}])[0]
        status = str(res_data.get("status", "")).lower()
        print(f"DEBUG: Zoho Create Status: {status}")
        
        if status == "success":
            record_id = res_data.get("id") or res_data.get("details", {}).get("id")
            print(f"[SUCCESS] Record Created Successfully: {record_id}")
            
            # --- ATTACH INPUT FILE ---
            if original_file_path:
                abs_path = os.path.abspath(original_file_path)
                if os.path.exists(abs_path):
                    await call_zoho_tool(session, "zohocrm_upload_file", {
                        "module": "Events",
                        "record_id": record_id,
                        "file_path": abs_path
                    })
            
            return {"success": True, "id": record_id, "subject": zoho_event["Subject"]}
        else:
            return {"success": False, "error": f"{res_data.get('message')} ({res_data.get('code')})"}
    
    return {"success": False, "error": f"Unexpected response format: {str(result)}"}

# Document Extraction
def extract_text(file_path):
    file_ext = os.path.splitext(file_path)[1].lower()
    if file_ext == '.pdf':
        doc = fitz.open(file_path)
        return "\n".join([page.get_text() for page in doc])
    elif file_ext == '.docx':
        doc = Document(file_path)
        return "\n".join([para.text for para in doc.paragraphs])
    return ""

def encode_image(image_bytes):
    return base64.b64encode(image_bytes).decode('utf-8')

async def extract_meeting_details_with_ai(content_or_path, is_bytes=False):
    if is_bytes:
        # For screenshots or uploaded images
        base64_image = encode_image(content_or_path)
        file_ext = "image"
    else:
        file_path = content_or_path
        file_ext = os.path.splitext(file_path)[1].lower()

    prompt = f"""
    Extract ALL individual meetings or appointments from the provided document content or image. 
    Many documents will contain multiple meetings in a list - identify and extract every single one separately.
    
    CRITICAL: Look for a date header (e.g., "Wednesday, 25 March 2026") at the top of the document. 
    Apply this date to all meetings listed below it unless a specific meeting has its own different date.
    Do NOT use today's date if a date is mentioned anywhere in the document.

    Output strictly JSON in this format:
    {{
      "meetings": [
        {{
          "Contact_Name": "string (the primary contact or person name)",
          "Meeting_Title": "string (The primary activity header leading the entry, e.g., 'FEALD ACTIVITY', 'SITE VISIT', etc. CRITICAL: Never use values from the 'NOTE' field or other sub-fields as the title. Only use the main section heading.)",
          "Start_DateTime": "ISO 8601 string (e.g., 2026-03-25T09:20:00+05:30)",
          "End_DateTime": "ISO 8601 string (e.g., 2026-03-25T09:40:00+05:30)",
          "Participants": [{{ "name": "string", "email": "string or null" }}],
          "Description": "string (include phone numbers and additional details here)",
          "Location": "string"
        }}
      ]
    }}
    If a field is unknown, use null or an empty string. Do not use 'Not Provided' or other filler text.
    Today is {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}. (This is for context only, prioritize dates found IN the document).
    """
    
    messages = [{"role": "system", "content": "You are a specialized meeting analyst assistant. Extract details accurately."}]

    if file_ext in ['.jpg', '.jpeg', '.png', 'image']:
        if not is_bytes:
            with open(file_path, "rb") as bf:
                base64_image = encode_image(bf.read())
        
        messages.append({
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        })
    else:
        text = extract_text(file_path)
        if not text: return None
        messages.append({
            "role": "user",
            "content": f"{prompt}\n\nDocument Content:\n{text}"
        })

    try:
        response = await asyncio.to_thread(
            client.chat.completions.create,
            model=MODEL_ID,
            messages=messages,
            # Force JSON
            response_format={"type": "json_object"}
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"AI Extraction Error: {e}")
        return None
