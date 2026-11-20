import { translateTree } from "./lexicon.js";

export function renderAbout(container) {
  container.innerHTML = `
    <section class="about">
      <h2 data-t="about.title"></h2>
      <p class="about-lead" data-t="about.lead"></p>

      <div class="about-box">
      <h3 data-t="about.contribute"></h3>
      <p data-t="about.contribute.how"><strong data-hole="button" data-t="about.contribute.button"></strong></p>
      <p data-t="about.contribute.luxury"><em data-hole="page" data-t="tab.luxury"></em></p>

      <h3 data-t="about.links"></h3>
      <ul class="about-links">
        <li><a href="https://github.com/wookiefriseur/LFC"
               target="_blank" rel="noopener noreferrer" data-t="about.links.source"></a></li>
        <li><a href="https://www.esoui.com/downloads/info4804-LibFurnitureCatalogue.html"
               target="_blank" rel="noopener noreferrer" data-t="about.links.library"></a></li>
        <li><a href="https://www.esoui.com/downloads/info1617-FurnitureCatalogue.html"
               target="_blank" rel="noopener noreferrer" data-t="about.links.addon"></a></li>
      </ul>
      </div>

      <p class="muted about-credit" data-t="about.credit"><a data-hole="uesp" href="https://esoitem.uesp.net/"
          target="_blank" rel="noopener noreferrer">UESP</a><a data-hole="licence" href="https://creativecommons.org/licenses/by-sa/2.5/"
           target="_blank" rel="noopener noreferrer">CC BY-SA 2.5</a></p>
    </section>
  `;
  translateTree(container);
}
