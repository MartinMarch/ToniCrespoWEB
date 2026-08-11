import type { SiteLanguage } from "../app/sitePreferences";
import type { CurrentPage } from "../types/currentSite";
import type { NewsImage, NewsItem } from "../types/domain";
import type { BiographyContent, EditableContentSnapshot } from "../services/editableContentService";
import type {
  ArtworkTranslations,
  CollectionTranslations,
  NewsTranslations,
  PageTranslations,
  PhotographyTranslations,
} from "../types/localization";

type PageTranslation = {
  html: string;
  title?: string;
};

type NewsTranslation = {
  title?: string;
  dateText?: string | null;
  location?: string | null;
  description?: string | null;
  imageAlt?: string | null;
  images?: Array<Partial<NewsImage>>;
};

type EditorialLanguageTranslations = {
  pages: Partial<Record<CurrentPage["kind"], PageTranslation>>;
  news: Record<string, NewsTranslation>;
};

const homeTranslations = {
  en: `<h4><span style="color: #000000;">When he dies, everyone must leave something behind, my grandfather used to say. A child, a book, a painting, a house, a wall built, or a pair of shoes. Or a garden planted. Something your hand has touched in a special way, so that your soul has somewhere to go when you die, and when people look at that tree, or that flower, that you planted, you will be there. "It doesn't matter what you do," he said, "as long as you change something from the way it was before you touched it, making it something like you after you take your hands away. The difference between the man who just cuts lawns and a real gardener is in the touching. The lawn-cutter might just as well not have been there at all; the gardener will be there a lifetime."</span></h4>
<h4 style="text-align: right;"><span style="color: #000000;">Ray Bradbury</span><br />
<span style="color: #000000;"> Fahrenheit 451</span></h4>`,
  de: `<h4><span style="color: #000000;">Wenn man stirbt, muss jeder etwas hinterlassen, sagte mein Großvater. Ein Kind, ein Buch, ein Bild, ein Haus, eine errichtete Mauer oder ein Paar Schuhe. Oder einen gepflanzten Garten. Etwas, das deine Hand auf besondere Weise berührt hat, damit deine Seele einen Ort hat, an den sie gehen kann, wenn du stirbst; und wenn die Menschen diesen Baum oder diese Blume betrachten, die du gepflanzt hast, wirst du dort sein. "Es ist gleich, was du tust", sagte er, "solange du etwas gegenüber dem veränderst, wie es war, bevor du es berührt hast, und es zu etwas machst, das dir ähnelt, nachdem du die Hände davon genommen hast. Der Unterschied zwischen einem Menschen, der nur Rasen mäht, und einem wirklichen Gärtner liegt in der Berührung. Der Rasenmäher hätte genauso gut nie dort gewesen sein können; der Gärtner wird für immer dort sein."</span></h4>
<h4 style="text-align: right;"><span style="color: #000000;">Ray Bradbury</span><br />
<span style="color: #000000;"> Fahrenheit 451</span></h4>`,
  ca: `<h4><span style="color: #000000;">Quan mor, tothom ha de deixar alguna cosa enrere, deia el meu avi. Un fill, un llibre, un quadre, una casa, una paret aixecada o un parell de sabates. O un jardí plantat. Alguna cosa que la teva mà haurà tocat d'una manera especial, de manera que la teva ànima tingui algun lloc on anar quan moris, i quan la gent miri aquell arbre, o aquella flor, que tu vas plantar, tu hi seràs. "No importa el que facis", deia, "sempre que canviïs alguna cosa respecte de com era abans de tocar-la, convertint-la en alguna cosa que sigui com tu després d'haver-ne separat les mans. La diferència entre l'home que es limita a tallar la gespa i un autèntic jardiner és en el tacte. El tallador de gespa igual podria no haver-hi estat; el jardiner hi serà per sempre."</span></h4>
<h4 style="text-align: right;"><span style="color: #000000;">Ray Bradbury</span><br />
<span style="color: #000000;"> Fahrenheit 451</span></h4>`,
} satisfies Record<Exclude<SiteLanguage, "es">, string>;

const biographyTranslations = {
  en: `<h4>&nbsp;</h4>
<p>&nbsp;Toni Crespo is a Mallorcan artist and winner of the "Artistas de Mallorca 2024" art prize.</p>
<p>He completed his Fine Arts studies at the University of Barcelona.</p>
<p>Since the beginning of his career, he has combined his dedication to painting with teaching Art History.&nbsp;</p>
<p>He is interested in Informalist tendencies, especially abstract expressionism. In his creative process, he experiments with different techniques and materials, including acrylics, graphite, spray paint and collage.</p>
<p>A distinctive feature of his work is the integration of visual elements such as letters, words and even poems, which intertwine with forms and patches of colour to create a symbiosis between visual and verbal language. Collage acts as a symbolic bridge, giving words and letters not only a literary function, but also a symbolic and iconographic one.</p>
<p>Dispersed and fragmented letters and words evoke a kind of poetry in motion, transforming his works into true visual poems.</p>
<p>This approach encourages an intimate dialogue between painting, collage and word, enriching his work with a deep lyrical and conceptual charge.</p>
<p>He is currently experimenting with new materials and continues to deepen the expressive resources of collage.</p>
<p>Often inspired by his readings, Toni Crespo invites the viewer to decipher the hidden meanings between image and poetry, creating an artistic space in continuous transformation and in search of new creative horizons.</p>
<p>His work is exhibited in different cities.</p>
<p>&nbsp;</p>
<p>&nbsp;</p>


<p class="has-large-font-size"></p>



<p></p>`,
  de: `<h4>&nbsp;</h4>
<p>&nbsp;Toni Crespo ist ein mallorquinischer Künstler und Gewinner des Kunstpreises "Artistas de Mallorca 2024".</p>
<p>Er absolvierte sein Kunststudium an der Universität Barcelona.</p>
<p>Seit Beginn seiner Laufbahn verbindet er die Hingabe an die Malerei mit der Lehre der Kunstgeschichte.&nbsp;</p>
<p>Er interessiert sich für informelle Tendenzen, insbesondere für den abstrakten Expressionismus. In seinem kreativen Prozess experimentiert er mit verschiedenen Techniken und Materialien, darunter Acrylfarben, Graphit, Sprays und Collage.</p>
<p>Ein besonderes Merkmal seiner Arbeit ist die Integration unterschiedlicher visueller Elemente wie Buchstaben, Wörter und sogar Gedichte, die sich mit Formen und Farbflecken verweben und eine Symbiose zwischen visueller und verbaler Sprache schaffen. Die Collage wirkt als symbolische Brücke und verleiht Wörtern und Buchstaben nicht nur eine literarische, sondern auch eine symbolische und ikonografische Funktion.</p>
<p>Verstreute und fragmentierte Buchstaben und Wörter rufen eine Art Poesie in Bewegung hervor und verwandeln seine Werke in echte visuelle Gedichte.</p>
<p>Dieser Ansatz fördert einen intimen Dialog zwischen Malerei, Collage und Wort und bereichert sein Werk mit einer tiefen lyrischen und konzeptuellen Ladung.</p>
<p>Derzeit experimentiert er mit neuen Materialien und vertieft weiterhin die Ausdrucksmöglichkeiten der Collagetechnik.</p>
<p>Oft von seinen Lektüren inspiriert, lädt Toni Crespo den Betrachter ein, die verborgenen Bedeutungen zwischen Bild und Poesie zu entschlüsseln und schafft einen künstlerischen Raum in ständiger Veränderung und auf der Suche nach neuen kreativen Horizonten.</p>
<p>Seine Arbeit wird in verschiedenen Städten ausgestellt.</p>
<p>&nbsp;</p>
<p>&nbsp;</p>


<p class="has-large-font-size"></p>



<p></p>`,
  ca: `<h4>&nbsp;</h4>
<p>&nbsp;Toni Crespo és un artista mallorquí, guanyador del premi d'art "Artistas de Mallorca 2024".</p>
<p>Va completar els seus estudis d'Art a la Universitat de Barcelona.</p>
<p>Des dels seus inicis ha compaginat la dedicació a la pintura amb la docència de la Història de l'Art.&nbsp;</p>
<p>L'interessen les tendències informalistes, en concret l'expressionisme abstracte. En el seu procés creatiu, experimenta amb diferents tècniques i materials, entre els quals destaquen els acrílics, els grafits, els esprais i el collage.</p>
<p>Una característica distintiva del seu treball és la integració en la seva obra de diferents elements visuals com lletres, paraules i fins i tot poemes que s'entrellacen amb les formes i les taques de color, creant una simbiosi entre el llenguatge visual i verbal. El collage actua com un pont simbòlic, atorgant a les paraules i a les lletres no només una funció literària, sinó també simbòlica i iconogràfica.</p>
<p>Lletres i paraules disperses i fragmentades evoquen una mena de poesia en moviment, transformant les seves obres en autèntics poemes visuals.</p>
<p>Aquest enfocament afavoreix un diàleg íntim entre pintura, collage i paraula, enriquint la seva obra amb una profunda càrrega lírica i conceptual.</p>
<p>Actualment, experimenta amb nous materials i continua aprofundint en els recursos expressius de la tècnica del collage.</p>
<p>Inspirat sovint per les seves lectures, Toni Crespo convida l'espectador a desxifrar els significats ocults entre la imatge i la poesia, creant un espai artístic en transformació contínua i en recerca de nous horitzons creatius.</p>
<p>El seu treball s'exhibeix en diferents ciutats.</p>
<p>&nbsp;</p>
<p>&nbsp;</p>


<p class="has-large-font-size"></p>



<p></p>`,
} satisfies Record<Exclude<SiteLanguage, "es">, string>;

const translations: Record<Exclude<SiteLanguage, "es">, EditorialLanguageTranslations> = {
  en: {
    pages: {
      home: { html: homeTranslations.en, title: "Home" },
      biography: { html: biographyTranslations.en, title: "Biography" },
    },
    news: {
      "exposicion-primavera-2025": {
        title: "Spring Exhibition",
        dateText: "28 March - 12 April 2025",
        location: "Museu de Sóller",
        description: "Participation in Artist of Mallorca as part of the spring exhibition.",
        imageAlt: "Poster for the Artist of Mallorca Spring Exhibition",
        images: [{ alt: "Poster for the Artist of Mallorca Spring Exhibition" }],
      },
      "canal-4-tv-2024": {
        title: "Appearance on Canal 4 TV",
        dateText: "November 2024",
        location: "Canal 4",
        description: 'Participation in the TV programme "Artista", presented by Xisco Barceló.',
        imageAlt: "Image of Toni Crespo on Canal 4 TV",
        images: [
          { alt: "Image of Toni Crespo on Canal 4 TV" },
          { alt: "Screenshot of Toni Crespo's appearance on Canal 4 TV" },
        ],
      },
      "finalista-inca-2024": {
        title: "Finalist in the 15th Inca Fine Arts Competition 2024",
        dateText: "November 2024",
        location: "Centre d'Art Sa Quartera",
        description: "Finalist in the Inca fine arts competition.",
        imageAlt: "Photo of the finalists of the Inca 2024 competition",
        images: [{ alt: "Photo of the finalists of the Inca 2024 competition" }],
      },
      "entrevista-mallorcadiario-2024": {
        title: "Interview in Mallorcadiario.com",
        dateText: "November 2024",
        location: "Mallorcadiario.com",
        description: "Interview and gallery dedicated to Toni Crespo in Mallorcadiario.com.",
        imageAlt: "Screenshot of Toni Crespo's interview in Mallorcadiario.com",
        images: [{ alt: "Screenshot of Toni Crespo's interview in Mallorcadiario.com" }],
      },
      "great-artists-mallorca-2024": {
        title: "New Book on Artists Based in Mallorca",
        dateText: "October 2024",
        location: "Mallorca",
        description: "Great Artists of Mallorca project, with portraits and exhibitions planned in Palma and Wiesbaden.",
        imageAlt: "Axel Ruske photographing Toni Crespo in his studio",
        images: [
          {
            alt: "Axel Ruske photographing Toni Crespo in his studio",
            caption: "Photograph for the book Great Artists of Mallorca",
          },
        ],
      },
      "iii-certamen-artistas-mallorca-2024": {
        title: "First Prize at the 3rd Artists of Mallorca Competition",
        dateText: "August 2024",
        location: "Museu de Sóller",
        description: 'First prize with the work "El mar de Ulises", acrylic and collage on canvas.',
        imageAlt: "Press clipping from the 3rd Artists of Mallorca Competition 2024",
        images: [
          { alt: "Press clipping from the 3rd Artists of Mallorca Competition 2024" },
          {
            alt: "El mar de Ulises, prize-winning work at the 3rd Artists of Mallorca Competition",
            caption: "El mar de Ulises, acrylic and collage on canvas, 140 x 140 cm",
          },
        ],
      },
      "inauguracion-villa-dalia-2024": {
        title: "Villa Dalia Opening",
        dateText: "March 2024",
        location: "Palma",
        description: 'Group exhibition featuring the work "El corazón es un cazador solitario".',
        imageAlt: "El corazón es un cazador solitario, work presented at Villa Dalia",
        images: [
          {
            alt: "El corazón es un cazador solitario, work presented at Villa Dalia",
            caption: "El corazón es un cazador solitario, acrylic and collage on canvas, 140 x 140 cm",
          },
        ],
      },
      "garage-son-armadams-2023": {
        title: "Garage Son Armadams",
        dateText: "December 2023",
        location: "Palma",
        description: "Group exhibition at Garage Son Armadams.",
        imageAlt: "Poster for the Garage Son Armadams exhibition",
        images: [
          { alt: "Poster for the Garage Son Armadams exhibition" },
          { alt: "Image from the Garage Son Armadams group exhibition" },
        ],
      },
      "retorn-jardi-hivern-2023": {
        title: "Return to the Winter Garden",
        dateText: "November 2023",
        location: "Ca Ses Monges, Marratxí",
        description: "Solo exhibition at Ca Ses Monges.",
        imageAlt: "Poster for Retorn al Jardí d'Hivern",
        images: [{ alt: "Poster for Retorn al Jardí d'Hivern" }],
      },
      "exposicion-colectiva-5-5-2023": {
        title: "5/5 Group Exhibition",
        dateText: "October / November 2023",
        location: "Galeria Dionís Bennàssar, Pollença",
        description: 'Group exhibition featuring the work "One More Kiss Dear IV".',
        imageAlt: "Poster for the 5/5 group exhibition",
        images: [
          { alt: "Poster for the 5/5 group exhibition" },
          {
            alt: "One More Kiss Dear IV, work included in the 5/5 group exhibition",
            caption: "One More Kiss Dear IV, acrylic and collage on canvas, diptych 200 x 100 cm",
          },
        ],
      },
      "can-gelabert-binissalem-2013": {
        title: "Exhibition at Can Gelabert, Binissalem",
        dateText: "14 December 2013",
        location: "Can Gelabert, Binissalem",
        description: "Exhibition with Miquel Segura and Vicenç.",
        imageAlt: "Poster for the exhibition at Can Gelabert, Binissalem",
        images: [{ alt: "Poster for the exhibition at Can Gelabert, Binissalem" }],
      },
    },
  },
  de: {
    pages: {
      home: { html: homeTranslations.de, title: "Startseite" },
      biography: { html: biographyTranslations.de, title: "Biografie" },
    },
    news: {
      "exposicion-primavera-2025": {
        title: "Frühjahrsausstellung",
        dateText: "28. März - 12. April 2025",
        location: "Museu de Sóller",
        description: "Teilnahme an Artist of Mallorca im Rahmen der Frühjahrsausstellung.",
        imageAlt: "Plakat der Frühjahrsausstellung Artist of Mallorca",
        images: [{ alt: "Plakat der Frühjahrsausstellung Artist of Mallorca" }],
      },
      "canal-4-tv-2024": {
        title: "Teilnahme bei Canal 4 TV",
        dateText: "November 2024",
        location: "Canal 4",
        description: 'Teilnahme an der Fernsehsendung "Artista", präsentiert von Xisco Barceló.',
        imageAlt: "Bild von Toni Crespo bei Canal 4 TV",
        images: [
          { alt: "Bild von Toni Crespo bei Canal 4 TV" },
          { alt: "Screenshot von Toni Crespos Teilnahme bei Canal 4 TV" },
        ],
      },
      "finalista-inca-2024": {
        title: "Finalist des 15. Kunstwettbewerbs von Inca 2024",
        dateText: "November 2024",
        location: "Centre d'Art Sa Quartera",
        description: "Finalist beim Kunstwettbewerb von Inca.",
        imageAlt: "Foto der Finalisten des Wettbewerbs von Inca 2024",
        images: [{ alt: "Foto der Finalisten des Wettbewerbs von Inca 2024" }],
      },
      "entrevista-mallorcadiario-2024": {
        title: "Interview bei Mallorcadiario.com",
        dateText: "November 2024",
        location: "Mallorcadiario.com",
        description: "Interview und Galerie über Toni Crespo bei Mallorcadiario.com.",
        imageAlt: "Screenshot des Interviews mit Toni Crespo bei Mallorcadiario.com",
        images: [{ alt: "Screenshot des Interviews mit Toni Crespo bei Mallorcadiario.com" }],
      },
      "great-artists-mallorca-2024": {
        title: "Neues Buch über auf Mallorca ansässige Künstler",
        dateText: "Oktober 2024",
        location: "Mallorca",
        description: "Projekt Great Artists of Mallorca mit Porträts und geplanten Ausstellungen in Palma und Wiesbaden.",
        imageAlt: "Axel Ruske fotografiert Toni Crespo in seinem Atelier",
        images: [
          {
            alt: "Axel Ruske fotografiert Toni Crespo in seinem Atelier",
            caption: "Fotografie für das Buch Great Artists of Mallorca",
          },
        ],
      },
      "iii-certamen-artistas-mallorca-2024": {
        title: "Erster Preis beim 3. Wettbewerb Artists of Mallorca",
        dateText: "August 2024",
        location: "Museu de Sóller",
        description: 'Erster Preis mit dem Werk "El mar de Ulises", Acryl und Collage auf Leinwand.',
        imageAlt: "Presse zum 3. Wettbewerb Artists of Mallorca 2024",
        images: [
          { alt: "Presse zum 3. Wettbewerb Artists of Mallorca 2024" },
          {
            alt: "El mar de Ulises, prämiertes Werk beim 3. Wettbewerb Artists of Mallorca",
            caption: "El mar de Ulises, Acryl und Collage auf Leinwand, 140 x 140 cm",
          },
        ],
      },
      "inauguracion-villa-dalia-2024": {
        title: "Eröffnung Villa Dalia",
        dateText: "März 2024",
        location: "Palma",
        description: 'Gruppenausstellung mit dem Werk "El corazón es un cazador solitario".',
        imageAlt: "El corazón es un cazador solitario, in der Villa Dalia präsentiertes Werk",
        images: [
          {
            alt: "El corazón es un cazador solitario, in der Villa Dalia präsentiertes Werk",
            caption: "El corazón es un cazador solitario, Acryl und Collage auf Leinwand, 140 x 140 cm",
          },
        ],
      },
      "garage-son-armadams-2023": {
        title: "Garage Son Armadams",
        dateText: "Dezember 2023",
        location: "Palma",
        description: "Gruppenausstellung in Garage Son Armadams.",
        imageAlt: "Plakat der Ausstellung Garage Son Armadams",
        images: [
          { alt: "Plakat der Ausstellung Garage Son Armadams" },
          { alt: "Bild der Gruppenausstellung Garage Son Armadams" },
        ],
      },
      "retorn-jardi-hivern-2023": {
        title: "Rückkehr in den Wintergarten",
        dateText: "November 2023",
        location: "Ca Ses Monges, Marratxí",
        description: "Einzelausstellung in Ca Ses Monges.",
        imageAlt: "Plakat von Retorn al Jardí d'Hivern",
        images: [{ alt: "Plakat von Retorn al Jardí d'Hivern" }],
      },
      "exposicion-colectiva-5-5-2023": {
        title: "Gruppenausstellung 5/5",
        dateText: "Oktober / November 2023",
        location: "Galeria Dionís Bennàssar, Pollença",
        description: 'Gruppenausstellung mit dem Werk "One More Kiss Dear IV".',
        imageAlt: "Plakat der Gruppenausstellung 5/5",
        images: [
          { alt: "Plakat der Gruppenausstellung 5/5" },
          {
            alt: "One More Kiss Dear IV, Werk der Gruppenausstellung 5/5",
            caption: "One More Kiss Dear IV, Acryl und Collage auf Leinwand, Diptychon 200 x 100 cm",
          },
        ],
      },
      "can-gelabert-binissalem-2013": {
        title: "Ausstellung im Can Gelabert in Binissalem",
        dateText: "14. Dezember 2013",
        location: "Can Gelabert, Binissalem",
        description: "Ausstellung zusammen mit Miquel Segura und Vicenç.",
        imageAlt: "Plakat der Ausstellung im Can Gelabert in Binissalem",
        images: [{ alt: "Plakat der Ausstellung im Can Gelabert in Binissalem" }],
      },
    },
  },
  ca: {
    pages: {
      home: { html: homeTranslations.ca, title: "Inici" },
      biography: { html: biographyTranslations.ca, title: "Trajectòria" },
    },
    news: {
      "exposicion-primavera-2025": {
        title: "Exposició de Primavera",
        dateText: "28 març - 12 abril 2025",
        location: "Museu de Sóller",
        description: "Participació a Artist of Mallorca dins l'exposició de primavera.",
        imageAlt: "Cartell de l'Exposició de Primavera Artist of Mallorca",
        images: [{ alt: "Cartell de l'Exposició de Primavera Artist of Mallorca" }],
      },
      "canal-4-tv-2024": {
        title: "Participació a Canal 4 TV",
        dateText: "Novembre 2024",
        location: "Canal 4",
        description: 'Participació en el programa de TV "Artista", presentat per Xisco Barceló.',
        imageAlt: "Imatge de Toni Crespo a Canal 4 TV",
        images: [
          { alt: "Imatge de Toni Crespo a Canal 4 TV" },
          { alt: "Captura de la participació de Toni Crespo a Canal 4 TV" },
        ],
      },
      "finalista-inca-2024": {
        title: "Finalista del 15è Certamen d'Arts Plàstiques 2024 d'Inca",
        dateText: "Novembre 2024",
        location: "Centre d'Art Sa Quartera",
        description: "Finalista en el certamen d'arts plàstiques d'Inca.",
        imageAlt: "Foto dels finalistes del certamen d'Inca 2024",
        images: [{ alt: "Foto dels finalistes del certamen d'Inca 2024" }],
      },
      "entrevista-mallorcadiario-2024": {
        title: "Entrevista a Mallorcadiario.com",
        dateText: "Novembre 2024",
        location: "Mallorcadiario.com",
        description: "Entrevista i galeria dedicada a Toni Crespo a Mallorcadiario.com.",
        imageAlt: "Captura de l'entrevista de Toni Crespo a Mallorcadiario.com",
        images: [{ alt: "Captura de l'entrevista de Toni Crespo a Mallorcadiario.com" }],
      },
      "great-artists-mallorca-2024": {
        title: "Nou llibre sobre artistes establerts a Mallorca",
        dateText: "Octubre 2024",
        location: "Mallorca",
        description: "Projecte Great Artists of Mallorca, amb retrats i exposicions previstes a Palma i Wiesbaden.",
        imageAlt: "Axel Ruske fotografiant Toni Crespo al seu estudi",
        images: [
          {
            alt: "Axel Ruske fotografiant Toni Crespo al seu estudi",
            caption: "Fotografia per al llibre Great Artists of Mallorca",
          },
        ],
      },
      "iii-certamen-artistas-mallorca-2024": {
        title: "Primer premi al III Certamen Artistas de Mallorca",
        dateText: "Agost 2024",
        location: "Museu de Sóller",
        description: 'Primer premi amb l\'obra "El mar de Ulises", acrílic i collage sobre llenç.',
        imageAlt: "Premsa del III Certamen Artistas de Mallorca 2024",
        images: [
          { alt: "Premsa del III Certamen Artistas de Mallorca 2024" },
          {
            alt: "El mar de Ulises, obra premiada al III Certamen Artistas de Mallorca",
            caption: "El mar de Ulises, acrílic i collage sobre llenç, 140 x 140 cm",
          },
        ],
      },
      "inauguracion-villa-dalia-2024": {
        title: "Inauguració Villa Dalia",
        dateText: "Març 2024",
        location: "Palma",
        description: 'Exposició col·lectiva amb l\'obra "El corazón es un cazador solitario".',
        imageAlt: "El corazón es un cazador solitario, obra presentada a Villa Dalia",
        images: [
          {
            alt: "El corazón es un cazador solitario, obra presentada a Villa Dalia",
            caption: "El corazón es un cazador solitario, acrílic i collage sobre llenç, 140 x 140 cm",
          },
        ],
      },
      "garage-son-armadams-2023": {
        title: "Garage Son Armadams",
        dateText: "Desembre 2023",
        location: "Palma",
        description: "Exposició col·lectiva a Garage Son Armadams.",
        imageAlt: "Pòster de l'exposició Garage Son Armadams",
        images: [
          { alt: "Pòster de l'exposició Garage Son Armadams" },
          { alt: "Imatge de l'exposició col·lectiva Garage Son Armadams" },
        ],
      },
      "retorn-jardi-hivern-2023": {
        title: "Retorn al Jardí d'Hivern",
        dateText: "Novembre 2023",
        location: "Ca Ses Monges, Marratxí",
        description: "Exposició individual a Ca Ses Monges.",
        imageAlt: "Cartell de Retorn al Jardí d'Hivern",
        images: [{ alt: "Cartell de Retorn al Jardí d'Hivern" }],
      },
      "exposicion-colectiva-5-5-2023": {
        title: "Exposició col·lectiva 5/5",
        dateText: "Octubre / novembre 2023",
        location: "Galeria Dionís Bennàssar, Pollença",
        description: 'Exposició col·lectiva amb l\'obra "One More Kiss Dear IV".',
        imageAlt: "Cartell de l'exposició col·lectiva 5/5",
        images: [
          { alt: "Cartell de l'exposició col·lectiva 5/5" },
          {
            alt: "One More Kiss Dear IV, obra inclosa a l'exposició col·lectiva 5/5",
            caption: "One More Kiss Dear IV, acrílic i collage sobre llenç, díptic 200 x 100 cm",
          },
        ],
      },
      "can-gelabert-binissalem-2013": {
        title: "Exposició a Can Gelabert de Binissalem",
        dateText: "14 desembre 2013",
        location: "Can Gelabert, Binissalem",
        description: "Exposició amb Miquel Segura i Vicenç.",
        imageAlt: "Cartell de l'exposició a Can Gelabert de Binissalem",
        images: [{ alt: "Cartell de l'exposició a Can Gelabert de Binissalem" }],
      },
    },
  },
};

export function getEditorialPageTranslations(kind: CurrentPage["kind"]): PageTranslations {
  return {
    en: translations.en.pages[kind],
    de: translations.de.pages[kind],
    ca: translations.ca.pages[kind],
  };
}

export function getEditorialNewsTranslations(slug: string): NewsTranslations {
  return {
    en: translations.en.news[slug],
    de: translations.de.news[slug],
    ca: translations.ca.news[slug],
  };
}

export function translateEditorialContent(snapshot: EditableContentSnapshot, language: SiteLanguage): EditableContentSnapshot {
  if (language === "es") return snapshot;

  const languageTranslations = translations[language];

  return {
    ...snapshot,
    biography: translateBiography(snapshot.biography, languageTranslations.pages.biography, language),
    collections: snapshot.collections.map((collection) => {
      const translation = collection.translations?.[language] as Partial<CollectionTranslations[typeof language]> | undefined;

      return {
        ...collection,
        title: translation?.title ?? collection.title,
        description: translation?.description ?? collection.description,
        artworks: collection.artworks.map((artwork) => translateArtwork(artwork, language)),
      };
    }),
    newsItems: snapshot.newsItems.map((item) => translateNewsItem(item, languageTranslations.news[item.slug], language)),
    pages: snapshot.pages.map((page) => translatePage(page, languageTranslations.pages[page.kind], language)),
    photoItems: snapshot.photoItems.map((item) => translatePhotographyItem(item, language)),
  };
}

function translateBiography(
  biography: BiographyContent,
  translation: PageTranslation | undefined,
  language: Exclude<SiteLanguage, "es">,
): BiographyContent {
  return {
    ...biography,
    page: biography.page ? translatePage(biography.page, translation, language) : null,
    galleryImages: biography.galleryImages.map((image) => {
      const localized = image.translations?.[language];
      return {
        ...image,
        alt: localized?.alt ?? image.alt,
        caption: localized?.caption ?? image.caption,
      };
    }),
  };
}

function translatePage(
  page: CurrentPage,
  staticTranslation: PageTranslation | undefined,
  language: Exclude<SiteLanguage, "es">,
): CurrentPage {
  const translation = page.translations?.[language];
  const html = translation?.html ?? staticTranslation?.html ?? page.html;

  return {
    ...page,
    html,
    text: html.replace(/<[^>]*>/g, " "),
    title: translation?.title ?? staticTranslation?.title ?? page.title,
  };
}

function translateNewsItem(
  item: NewsItem,
  staticTranslation: NewsTranslation | undefined,
  language: Exclude<SiteLanguage, "es">,
): NewsItem {
  const translation = item.translations?.[language];

  return {
    ...item,
    title: translation?.title ?? staticTranslation?.title ?? item.title,
    dateText: translation?.dateText ?? staticTranslation?.dateText ?? item.dateText,
    location: translation?.location ?? staticTranslation?.location ?? item.location,
    description: translation?.description ?? staticTranslation?.description ?? item.description,
    imageAlt: translation?.imageAlt ?? staticTranslation?.imageAlt ?? item.imageAlt,
    images: item.images?.map((image, index) => ({
      ...image,
      ...staticTranslation?.images?.[index],
      ...image.translations?.[language],
    })),
  };
}

function translateArtwork(
  artwork: EditableContentSnapshot["collections"][number]["artworks"][number],
  language: Exclude<SiteLanguage, "es">,
) {
  const translation = artwork.translations?.[language] as Partial<ArtworkTranslations[typeof language]> | undefined;

  return {
    ...artwork,
    title: translation?.title ?? artwork.title,
    caption: translation?.caption ?? artwork.caption,
    description: translation?.description ?? artwork.description,
    technique: translation?.technique ?? artwork.technique,
  };
}

function translatePhotographyItem(
  item: EditableContentSnapshot["photoItems"][number],
  language: Exclude<SiteLanguage, "es">,
) {
  const translation = item.translations?.[language] as Partial<PhotographyTranslations[typeof language]> | undefined;

  return {
    ...item,
    title: translation?.title ?? item.title,
    imageAlt: translation?.imageAlt ?? item.imageAlt,
  };
}
