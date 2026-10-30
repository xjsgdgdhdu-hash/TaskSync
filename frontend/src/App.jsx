import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase.js";

function App() {
  const [status, setStatus] = useState("Sprawdzam połączenie...");

  useEffect(() => {
    async function checkConnection() {
      try {
        const { error } = await supabase.auth.getSession();

        if (error) {
          setStatus("Błąd Supabase: " + error.message);
        } else {
          setStatus("Połączenie z Supabase działa!");
        }
      } catch (error) {
        setStatus("Błąd: " + error.message);
      }
    }

    checkConnection();
  }, []);

  return (
    <main style={{ padding: "30px", fontFamily: "Arial" }}>
      <h1>TaskSync</h1>
      <p>{status}</p>
    </main>
  );
}

export default App;