import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
    apiKey: "AIzaSyD27y1P8Ge_IPNcLsaRnwO5UsRALzjhpLk",
    authDomain: "crm-pipeline-intelligence.firebaseapp.com",
    projectId: "crm-pipeline-intelligence",
    storageBucket: "crm-pipeline-intelligence.firebasestorage.app",
    messagingSenderId: "746998562983",
    appId: "1:746998562983:web:63830bc3e27fe627d8db82",
    measurementId: "G-LF300EMJT7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

export { app, auth, analytics };
