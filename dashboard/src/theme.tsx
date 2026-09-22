import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({ theme: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState(
    () => localStorage.getItem("codesage_theme") || "dark"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("codesage_theme", theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    []
  );
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
