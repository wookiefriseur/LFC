export function renderAbout(container) {
  container.innerHTML = `
    <section class="about">
      <h2>About this site</h2>
      <p class="about-lead">
        LibFurnitureCatalogue is the furniture database for the FurnitureCatalogue AddOn. It carries where each furnishing comes from and a query API other AddOns can call.
      </p>

      <div class="about-box">
      <h3>How to contribute</h3>
      <p>
        Correct what you know is wrong, then press <strong>Send it</strong> in the footer. Your changes are collected into one list you can check before anything leaves the page. Sending opens a GitHub
        issue with that list. If you have no GitHub account you can copy the same text and paste it on the ESOUI forums instead.
      </p>
      <p>
        The default use case is adding weekly Luxury furnishing updates from Zanil Theran (about 10 furnishings each weekend). There is an extra <em>Luxury</em> form just for that.
      </p>

      <h3>Where things are</h3>
      <ul class="about-links">
        <li><a href="https://github.com/wookiefriseur/LFC"
               target="_blank" rel="noopener noreferrer">Source on GitHub</a></li>
        <li><a href="https://www.esoui.com/downloads/info4804-LibFurnitureCatalogue.html"
               target="_blank" rel="noopener noreferrer">Library on ESOUI</a></li>
        <li><a href="https://www.esoui.com/downloads/info1617-FurnitureCatalogue.html"
               target="_blank" rel="noopener noreferrer">FurnitureCatalogue on ESOUI</a></li>
      </ul>
      </div>

      <p class="muted about-credit">
        Item pages and icons via <a href="https://esoitem.uesp.net/"
          target="_blank" rel="noopener noreferrer">UESP</a>. Content licensed
        <a href="https://creativecommons.org/licenses/by-sa/2.5/"
           target="_blank" rel="noopener noreferrer">CC BY-SA 2.5</a>.
      </p>
    </section>
  `;
}
