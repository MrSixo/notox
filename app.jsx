// Main app: router + auth gate + tweaks panel.
const { useState: useStateApp, useEffect: useEffectApp } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "dashboardLayout": "cards",
  "density": "regular",
  "accent": "#d4a017"
}/*EDITMODE-END*/;

const App = () => {
  const [user, setUser] = useStateApp(null);
  const [page, setPage] = useStateApp("dashboard");
  const [forecastLoc, setForecastLoc] = useStateApp("deb");
  const [forecastModel, setForecastModel] = useStateApp("dewolf2003");
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Live-apply accent color to design tokens
  useEffectApp(() => {
    document.documentElement.style.setProperty("--green", t.accent);
    document.documentElement.style.setProperty("--green-hover", t.accent);
  }, [t.accent]);

  // Apply theme class to <body>
  useEffectApp(() => {
    document.body.classList.remove("theme-dark", "theme-grey", "theme-light");
    document.body.classList.add("theme-" + t.theme);
  }, [t.theme]);

  if (!user) return <LoginPage onLogin={setUser}/>;

  return (
    <>
      <Shell
        page={page}
        setPage={setPage}
        user={user}
        onLogout={() => setUser(null)}
        theme={t.theme}
        onThemeChange={v => setTweak("theme", v)}
      >
        <div data-screen-label={page}>
          {page === "dashboard" && (
            <DashboardPage
              setPage={setPage}
              setForecastLoc={setForecastLoc}
              layout={t.dashboardLayout}
              density={t.density}
              accent={t.accent}
              theme={t.theme}
            />
          )}
          {page === "meteo" && <MeteoPage theme={t.theme}/>}
          {page === "diseases" && <DiseasesPage/>}
          {page === "models" && <ModelsPage setPage={setPage} setForecastModel={setForecastModel}/>}
          {page === "forecast" && <ForecastPage locId={forecastLoc} setLocId={setForecastLoc} modelId={forecastModel} setModelId={setForecastModel}/>}
          {page === "validation" && <ValidationPage/>}
          {page === "sources" && <SourcesPage/>}
          {page === "admin" && <AdminPage/>}
        </div>
      </Shell>

      <TweaksPanel>
        <TweakSection label="Téma"/>
        <TweakRadio
          label="Színséma"
          value={t.theme}
          options={["dark", "grey", "light"]}
          onChange={v => setTweak("theme", v)}
        />
        <TweakColor
          label="Akcent szín"
          value={t.accent}
          options={["#4caf7d", "#5b9cf6", "#d4a017", "#9b5de5"]}
          onChange={v => setTweak("accent", v)}
        />
        <TweakSection label="Dashboard"/>
        <TweakRadio
          label="Elrendezés"
          value={t.dashboardLayout}
          options={["cards", "list", "map"]}
          onChange={v => setTweak("dashboardLayout", v)}
        />
        <TweakRadio
          label="Sűrűség"
          value={t.density}
          options={["regular", "compact"]}
          onChange={v => setTweak("density", v)}
        />
      </TweaksPanel>
    </>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
