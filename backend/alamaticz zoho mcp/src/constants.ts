export const ZOHO_ACCOUNTS_URL = "https://accounts.zoho.com";
export const CHARACTER_LIMIT = 25000;

export const SUPPORTED_MODULES = [
  "Leads", "Contacts", "Accounts", "Deals", "Campaigns",
  "Tasks", "Cases", "Events", "Calls", "Solutions",
  "Products", "Vendors", "Price_Books", "Quotes",
  "Sales_Orders", "Purchase_Orders", "Invoices",
  "Appointments", "Services"
] as const;

export const USER_TYPES = [
  "AllUsers", "ActiveUsers", "DeactiveUsers", "ConfirmedUsers",
  "NotConfirmedUsers", "DeletedUsers", "ActiveConfirmedUsers",
  "AdminUsers", "ActiveConfirmedAdmins", "CurrentUser"
] as const;
