import { Link } from "react-router-dom";
import { useSitePreferences } from "../../app/sitePreferences";
import toniCrespoLogo from "../../assets/toni_crespo_logo_vector.svg";
import { artistContact } from "../../lib/contact";

export function Footer() {
  const { labels } = useSitePreferences();

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand-block">
          <Link to="/" className="site-footer__logo" aria-label="Toni Crespo inicio">
            <img src={toniCrespoLogo} alt="Toni Crespo" />
          </Link>
          <p>{labels.footer.location}</p>
        </div>

        <nav aria-label={labels.aria.secondaryNav} className="site-footer__nav">
          <Link to="/obra">{labels.nav.work}</Link>
          <Link to="/fotografia">{labels.nav.photography}</Link>
          <Link to="/noticias">{labels.nav.news}</Link>
          <Link to="/trayectoria">{labels.nav.biography}</Link>
        </nav>

        <div className="site-footer__contact">
          <a href={`mailto:${artistContact.email}`}>{artistContact.email}</a>
          <a href="tel:+34659959352">+34 659 959 352</a>
          <a href={artistContact.instagramProfileUrl} target="_blank" rel="noreferrer">
            @tonicrespo.art
          </a>
        </div>
      </div>
      <div className="site-footer__bottom">
        <span>© 2026 Toni Crespo</span>
        <span>{labels.footer.baseline}</span>
      </div>
    </footer>
  );
}
