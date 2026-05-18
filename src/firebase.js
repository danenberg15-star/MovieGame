// src/firebase.js
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDmbIUCxcGfiegokuVChM6JHSwigNIvMbA",
  authDomain: "moviezguess.firebaseapp.com",
  databaseURL: "https://moviezguess-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "moviezguess",
  storageBucket: "moviezguess.firebasestorage.app",
  messagingSenderId: "114321896387",
  appId: "1:114321896387:web:8362217e78c31e841d8376"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Realtime Database
const database = getDatabase(app);

export { database };