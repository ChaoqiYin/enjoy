import logo from '../assets/generated/enjoy-logo.png'
import logoLight from '../assets/generated/enjoy-logo-light.png'

/**
 * The product's wordmark, as the old window drew it: one image per theme,
 * swapped by the `dark` variant rather than by a React state, because the theme
 * is applied to the document and React is not told about the switch.
 *
 * The name is not translated — it is what the application is called.
 */
export function BrandLogo() {
  return (
    <span className="block w-28 shrink-0" role="img" aria-label="Enjoy">
      <img
        className="dark:hidden block h-auto w-full"
        src={logo}
        alt=""
        width={1546}
        height={573}
      />
      <img
        className="hidden h-auto w-full dark:block"
        src={logoLight}
        alt=""
        width={1546}
        height={573}
      />
    </span>
  )
}
