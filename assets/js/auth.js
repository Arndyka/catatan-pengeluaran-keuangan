import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth } from "./firebase.js";

function authMessage(error) {
  const messages = {
    "auth/invalid-email": "Format email tidak valid.",
    "auth/email-already-in-use": "Email sudah terdaftar.",
    "auth/weak-password": "Password minimal 6 karakter.",
    "auth/user-not-found": "Akun tidak ditemukan.",
    "auth/wrong-password": "Password salah.",
    "auth/invalid-credential": "Email atau password salah.",
    "auth/operation-not-allowed": "Email/Password belum aktif di Firebase.",
    "auth/unauthorized-domain": "Domain belum diizinkan di Firebase.",
    "auth/network-request-failed": "Koneksi internet bermasalah."
  };

  return messages[error?.code] || error?.message || "Autentikasi gagal.";
}

export function setupAuth({
  loginTab,
  registerTab,
  form,
  emailInput,
  passwordInput,
  submitButton,
  messageElement,
  onMessage
}) {
  let mode = "login";

  function setMode(nextMode) {
    mode = nextMode;
    loginTab.classList.toggle("active", mode === "login");
    registerTab.classList.toggle("active", mode === "register");
    submitButton.textContent = mode === "login" ? "Login" : "Register";
    passwordInput.autocomplete =
      mode === "login" ? "current-password" : "new-password";
    onMessage("hide", "");
  }

  loginTab.addEventListener("click", () => setMode("login"));
  registerTab.addEventListener("click", () => setMode("register"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || password.length < 6) {
      onMessage("error", "Email wajib valid dan password minimal 6 karakter.");
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = mode === "login" ? "Login..." : "Register...";

    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      onMessage("error", authMessage(error));
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = mode === "login" ? "Login" : "Register";
    }
  });

  setMode("login");
}

export function observeAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function logout() {
  return signOut(auth);
}
