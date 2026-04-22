# 🚀 Launch Guide: Zoho AI Dashboard

Your application consists of a **FastAPI Backend** and a **React/Vite Frontend**. Here is how to run both components.

## 1. Backend API (Python)
The backend handles file uploads, AI extraction, and CRM synchronization.

**Prerequisites:**
- Ensure you have the `requirements.txt` installed (`pip install -r requirements.txt`).
- Ensure `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, and `ZOHO_REFRESH_TOKEN` are in your `.env`.

**Command:**
```bash
python api.py
```
> [!NOTE]
> The backend runs on **http://localhost:8000**

---

## 2. Frontend Dashboard (React)
The dashboard provides a visual interface for uploading documents and taking screenshots.

**Location:** `c:\Users\hima7\OneDrive\Desktop\project12\crm_meetings\dashboard`

**Commands:**
```bash
# Move to the dashboard folder
cd dashboard

# Install dependencies if you haven't already
npm install

# Start the dashboard
npm run dev
```
> [!NOTE]
> The dashboard runs on **http://localhost:5173**

---

## 🛠️ Combined Summary
| Component | URL | Command |
| :--- | :--- | :--- |
| **Backend** | `http://localhost:8000` | `python api.py` |
| **Frontend** | `http://localhost:5173` | `npm run dev` |

> [!TIP]
> **Screenshot Feature**: Once the dashboard is open, you can click the **Capture Screenshot** button. Choose "Window" or "Screen" to snap a picture of any document or web page, and the AI will automatically extract meetings from it and sync them to Zoho CRM.
