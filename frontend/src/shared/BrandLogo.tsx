export function BrandLogo() {
  return (
    <span className="block w-28 shrink-0" role="img" aria-label="Enjoy">
      <img
        className="block w-full h-auto dark:hidden"
        src="/assets/generated/enjoy-logo.png"
        alt=""
        width={1546}
        height={573}
      />
      <img
        className="hidden w-full h-auto dark:block"
        src="/assets/generated/enjoy-logo-light.png"
        alt=""
        width={1546}
        height={573}
      />
    </span>
  );
}
