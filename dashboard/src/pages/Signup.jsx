import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

// TODO: connect to real auth backend
export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const validate = () => {
    const next = {};
    if (!form.email.trim()) next.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = "Enter a valid email";
    if (!form.password) next.password = "Password is required";
    else if (form.password.length < 8) next.password = "At least 8 characters";
    if (form.confirm !== form.password) next.confirm = "Passwords do not match";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (e) => {
    e.preventDefault();
    if (!validate()) return;
    // TODO: connect to real auth backend
    localStorage.setItem("codesage_auth", JSON.stringify({ email: form.email }));
    navigate("/dashboard/scan");
  };

  // TODO: connect to real OAuth backend
  const googleClicked = () => {
    console.log("Google OAuth clicked");
    localStorage.setItem("codesage_auth", JSON.stringify({ email: "google-user@stub" }));
    toast("Google OAuth stub — signed up");
    navigate("/dashboard/scan");
  };

  return (
    <div className="auth-page">
      <Link to="/" className="brand auth-brand"><span className="brand-mark">⌘</span> CodeSage</Link>
      <form className="auth-card" onSubmit={submit} noValidate>
        <h1>Create your account</h1>
        <p className="hint">Start auditing repositories in minutes.</p>

        <label>Email
          <input type="email" value={form.email} onChange={set("email")} placeholder="you@company.com" />
          {errors.email && <span className="field-error">{errors.email}</span>}
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" />
          {errors.password && <span className="field-error">{errors.password}</span>}
        </label>
        <label>Confirm password
          <input type="password" value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" />
          {errors.confirm && <span className="field-error">{errors.confirm}</span>}
        </label>

        <button type="submit" className="primary-btn big full">Sign up</button>

        <div className="divider"><span>or</span></div>

        <button type="button" className="google-btn" onClick={googleClicked}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Continue with Google
        </button>

        <p className="auth-toggle">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
