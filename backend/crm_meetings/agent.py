import os
import time
import json
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler
from processor import extract_meeting_details_with_ai, create_meeting_via_mcp, MCP_SERVER_PATH
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from dotenv import load_dotenv

load_dotenv()

# Configure folders to watch
WATCH_DIR = "incoming_meetings"
if not os.path.exists(WATCH_DIR):
    os.makedirs(WATCH_DIR)

PROCESSED_DIR = "processed_meetings"
if not os.path.exists(PROCESSED_DIR):
    os.makedirs(PROCESSED_DIR)

# 🛠️ MCP Helper to call your Zoho tools (Duplicate in agent for standalone use if needed)
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

async def process_file(file_path):
    print(f"📄 New file detected: {file_path}")
    
    # 1. Extract details with AI
    extracted_data = await extract_meeting_details_with_ai(file_path)
    if not extracted_data:
        print(f"⚠️ Failed to extract data from {file_path}")
        return

    meetings = extracted_data.get("meetings", [])
    print(f"✅ Extracted {len(meetings)} meetings from {file_path}")

    # 2. Connect to MCP and create records
    server_params = StdioServerParameters(
        command="node",
        args=[MCP_SERVER_PATH],
        env=os.environ.copy()
    )

    try:
        async with stdio_client(server_params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                
                for m_data in meetings:
                    # Logic is now handled inside create_meeting_via_mcp (search + clean title)
                    await create_meeting_via_mcp(session, m_data, original_file_path=file_path)

        # 3. Move file to processed
        dest_path = os.path.join(PROCESSED_DIR, os.path.basename(file_path))
        # Handle filename collisions
        if os.path.exists(dest_path):
            timestamp = int(time.time())
            dest_path = os.path.join(PROCESSED_DIR, f"{timestamp}_{os.path.basename(file_path)}")
        
        shutil.move(file_path, dest_path)
        print(f"📦 Moved {file_path} to {PROCESSED_DIR}")

    except Exception as e:
        print(f"❌ Error during MCP processing: {e}")

class MeetingHandler(FileSystemEventHandler):
    def on_created(self, event):
        if event.is_directory:
            return
        
        file_path = event.src_path
        # Ignore non-document files
        if file_path.lower().endswith(('.pdf', '.docx', '.png', '.jpg', '.jpeg')):
            # Short delay to ensure file is completely written
            time.sleep(1)
            asyncio.run(process_file(file_path))

async def main():
    print(f"👀 Watching folder: {WATCH_DIR}")
    event_handler = MeetingHandler()
    observer = Observer()
    observer.schedule(event_handler, WATCH_DIR, recursive=False)
    observer.start()

    try:
        while True:
            await asyncio.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    import shutil # Needed in process_file
    asyncio.run(main())
