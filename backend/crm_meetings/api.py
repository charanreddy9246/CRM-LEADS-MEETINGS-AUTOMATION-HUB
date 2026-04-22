import os
import sys
import shutil
import uuid
import asyncio
from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
import processor
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

# Load environment variables at the very top
load_dotenv()

# Force create the log file immediately to ensure recording
with open("server_debug.log", "w", encoding="utf-8") as f:
    f.write(f"--- SERVER STARTING AT {processor.datetime.now()} ---\n")
    f.write(f"CWD: {os.getcwd()}\n")

app = FastAPI()

# Enable CORS for the UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)

class MeetingResult(BaseModel):
    subject: str
    success: bool
    id: Optional[str] = None
    error: Optional[str] = None

class ProcessingResponse(BaseModel):
    filename: str
    meetings_found: int
    results: List[MeetingResult]

# Global MCP session management
# For a production app, you might want more robust lifecycle management
mcp_session = None
mcp_exit_event = asyncio.Event()

async def get_mcp_session():
    global mcp_session
    if mcp_session:
        return mcp_session
    
    server_params = StdioServerParameters(
        command="node",
        args=[processor.MCP_SERVER_PATH],
        env=os.environ.copy()
    )
    
    # This is tricky because stdio_client is an async context manager
    # We'll start it and keep it running for the duration of the app
    # In a real app, use a proper lifecycle manager
    return None # Placeholder - we'll handle this in the endpoint for simplicity

@app.post("/upload", response_model=ProcessingResponse)
async def upload_file(file: UploadFile = File(...)):
    # Save file
    file_id = str(uuid.uuid4())
    file_ext = os.path.splitext(file.filename)[1].lower()
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{file_ext}")
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    
    # Process file
    try:
        # 1. Extract details with AI
        extracted_data = await processor.extract_meeting_details_with_ai(file_path)
        if not extracted_data or "meetings" not in extracted_data:
            raise HTTPException(status_code=400, detail="No meetings found or extraction failed")
        
        meetings = extracted_data["meetings"]
        results = []
        
        # 2. Connect to MCP and create records
        server_params = StdioServerParameters(
            command="node",
            args=[processor.MCP_SERVER_PATH],
            env=os.environ.copy()
        )
        
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                for m_data in meetings:
                    res = await processor.create_meeting_via_mcp(session, m_data, original_file_path=file_path)
                    
                    # Get display title: Use response or construct it locally if failure
                    display_title = res.get("subject") if res.get("success") else \
                        f"{m_data.get('Meeting_Title')} - {m_data.get('Contact_Name')}" if m_data.get('Meeting_Title') else \
                        m_data.get("Contact_Name") or "Unknown Meeting"

                    results.append(MeetingResult(
                        subject=display_title,
                        success=res["success"],
                        id=res.get("id"),
                        error=res.get("error")
                    ))
        
        return ProcessingResponse(
            filename=file.filename,
            meetings_found=len(meetings),
            results=results
        )
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"\n[CRITICAL ERROR] DURING UPLOAD: {str(e)}"
        print(error_msg)
        import traceback
        with open("server_debug.log", "a", encoding="utf-8") as f:
            f.write(f"\n--- ERROR AT {processor.datetime.now()} ---\n")
            f.write(error_msg + "\n")
            traceback.print_exc(file=f)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Server error: {str(e)}")
    finally:
        pass

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    # Ensure UTF-8 output to prevent crashes with special characters
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        pass
        
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
