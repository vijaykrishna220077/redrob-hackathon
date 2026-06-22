import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");

  const handleReset = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email);

    if (error) {
      alert(error.message);
    } else {
      alert("Password reset email sent!");
    }
  };

  return (
    <div>
      <h1>Forgot Password</h1>

      <input
        type="email"
        placeholder="Email"
        onChange={(e) => setEmail(e.target.value)}
      />

      <button onClick={handleReset}>Send Reset Link</button>
    </div>
  );
}