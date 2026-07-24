import { Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing.js";
import { SignIn } from "./routes/SignIn.js";
import { RequireAuth } from "./routes/RequireAuth.js";
import { Onboarding } from "./routes/onboarding/Onboarding.js";
import { Accountant } from "./routes/Accountant.js";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/signin" element={<SignIn />} />
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <Onboarding />
          </RequireAuth>
        }
      />
      <Route
        path="/accountant"
        element={
          <RequireAuth>
            <Accountant />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
