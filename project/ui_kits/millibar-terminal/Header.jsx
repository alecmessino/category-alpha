const { Pill, IngestionHUD } = window.CategoryAlphaDesignSystem_a835cf;

function MB_Header({ feeds }) {
  const nav = ["Overview", "Signals", "Hurricanes", "Docs [?]"];
  const [active, setActive] = React.useState("Hurricanes");
  return (
    <header style={{
      position: "sticky", top: 0, zIndex: 20, background: "#fff",
      borderBottom: "1px solid var(--border-dim)", padding: "10px 26px",
      display: "flex", alignItems: "center", gap: "14px",
    }}>
      <img src="../../assets/logo.svg" alt="Millibar Terminal" style={{ height: "44px", width: "auto", display: "block" }} />
      <Pill>Category Alpha</Pill>
      <IngestionHUD streams={feeds} />
      <nav style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
        {nav.map((n) => (
          <a key={n} href="#" onClick={(e) => { e.preventDefault(); setActive(n); }} style={{
            color: active === n ? "var(--accent)" : "var(--text-2)",
            background: active === n ? "var(--surface-sunken)" : "transparent",
            textDecoration: "none", fontSize: "13px", padding: "6px 12px",
            borderRadius: "8px", fontFamily: "var(--font-sans)", transition: "all var(--ease-ui)",
          }}>{n}</a>
        ))}
      </nav>
    </header>
  );
}
window.MB_Header = MB_Header;
