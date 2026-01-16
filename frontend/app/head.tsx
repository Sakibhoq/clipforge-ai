export default function Head() {
  // bump this when you want to force-update the tab icon everywhere
  const v = "orb-1";

  return (
    <>
      <link rel="icon" href={`/icon?v=${v}`} type="image/png" />
      <link rel="icon" href={`/icon?v=${v}`} type="image/png" sizes="16x16" />
      <link rel="icon" href={`/icon?v=${v}`} type="image/png" sizes="32x32" />
      <link rel="apple-touch-icon" href={`/icon?v=${v}`} />
      <meta name="theme-color" content="#0B0F14" />
    </>
  );
}
