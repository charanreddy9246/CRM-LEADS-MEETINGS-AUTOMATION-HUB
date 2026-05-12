# Use a Python 3.11 image with Node.js included
FROM nikolaik/python-nodejs:python3.11-nodejs20

# Set working directory
WORKDIR /app

# Copy requirement files
COPY backend/requirements.txt ./backend/

# Install Python dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the Zoho MCP server and build it
COPY backend/alamaticz\ zoho\ mcp ./backend/alamaticz\ zoho\ mcp
WORKDIR /app/backend/alamaticz zoho mcp
RUN npm install
RUN npm run build

# Copy the rest of the backend files
WORKDIR /app
COPY backend ./backend
COPY frontend/dist ./frontend/dist

# Expose port 9002 (the port your app runs on, though Render overrides this)
EXPOSE 9002

# Run the FastAPI server
CMD uvicorn backend.main_api:app --host 0.0.0.0 --port ${PORT:-9002}
