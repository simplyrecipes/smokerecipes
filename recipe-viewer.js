(function(){
  const app = document.getElementById("app");
  const RESERVED = new Set([
    "index.html",
    "about.html",
    "privacy-policy.html",
    "terms-of-service.html",
    "recipe.html"
  ]);

  function titleFromFilename(name){
    return name
      .replace(/\.html$/i, "")
      .split("-")
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function slugify(text){
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function readFileParam(){
    const file = new URLSearchParams(window.location.search).get("file");
    if(!file || !/^[a-z0-9][a-z0-9-]*\.html$/i.test(file) || RESERVED.has(file.toLowerCase())){
      return null;
    }
    return file;
  }

  function redirectTargetFromDocument(doc){
    const refreshMeta = [...doc.querySelectorAll("meta")].find((meta) => {
      return (meta.getAttribute("http-equiv") || "").toLowerCase() === "refresh";
    });

    if(refreshMeta){
      const content = refreshMeta.getAttribute("content") || "";
      const match = content.match(/url\s*=\s*([^;]+)/i);
      if(match && match[1]){
        return match[1].trim().replace(/^['"]|['"]$/g, "");
      }
    }

    for(const script of doc.querySelectorAll("script")){
      const text = script.textContent || "";
      const match = text.match(/(?:window\.)?location\.(?:replace|assign)\(\s*["']([^"']+)["']\s*\)|(?:window\.)?location\.href\s*=\s*["']([^"']+)["']/i);
      const target = match && (match[1] || match[2]);
      if(target){
        return target.trim();
      }
    }

    return "";
  }

  function maybeFixMojibake(text){
    if(!/[Ãâð]/.test(text)){
      return text;
    }

    try{
      return decodeURIComponent(escape(text));
    }catch(_err){
      return text;
    }
  }

  function makeState(title, body){
    app.innerHTML = `
      <section class="state-card">
        <p class="eyebrow">Recipe reader</p>
        <h1>${title}</h1>
        <p>${body}</p>
      </section>
    `;
  }

  function createElement(tagName, className, text){
    const element = document.createElement(tagName);
    if(className){
      element.className = className;
    }
    if(text){
      element.textContent = text;
    }
    return element;
  }

  function cloneNode(node){
    return document.importNode(node, true);
  }

  function extractIntro(elements){
    const remaining = [...elements];
    let heroImage = null;
    const intro = [];

    if(remaining[0] && remaining[0].matches("figure")){
      heroImage = remaining.shift();
    }

    while(remaining[0] && remaining[0].tagName === "P" && intro.length < 3){
      intro.push(remaining.shift());
    }

    return { heroImage, intro, remaining };
  }

  function buildSummaryCard(titleText, nodes, startIndex){
    const card = createElement("section", "summary-card");
    const title = createElement("h3", "", titleText);
    const intro = createElement(
      "p",
      "summary-copy",
      "The exported article leads with a compact overview, so the reader keeps those high-value points near the top instead of buried in the flow."
    );
    const grid = createElement("div", "summary-grid");

    card.append(title, intro, grid);

    let index = startIndex;
    let itemCount = 0;
    while(index < nodes.length){
      const iconNode = nodes[index];
      const textNode = nodes[index + 1];
      if(!iconNode || !textNode || iconNode.tagName !== "H6" || textNode.tagName !== "P"){
        break;
      }

      const item = createElement("article", "summary-item");
      const iconWrap = createElement("div", "summary-icon");
      const svg = iconNode.querySelector("svg");
      if(svg){
        iconWrap.appendChild(cloneNode(svg));
      }else{
        iconWrap.textContent = "•";
      }

      const copy = createElement("p", "summary-copy");
      copy.innerHTML = textNode.innerHTML;
      item.append(iconWrap, copy);
      grid.appendChild(item);
      itemCount += 1;
      index += 2;
    }

    return { node: itemCount ? card : null, nextIndex: index };
  }

  function buildNoteCard(titleText, nodes, startIndex, className){
    const card = createElement("section", className);
    const title = createElement("h3", "", titleText);
    card.appendChild(title);

    let index = startIndex;
    while(index < nodes.length){
      const current = nodes[index];
      if(/^H[1-6]$/.test(current.tagName)){
        break;
      }

      if(current.tagName === "P"){
        card.appendChild(cloneNode(current));
      }
      index += 1;
    }

    return { node: card, nextIndex: index };
  }

  function buildFaqList(node){
    const list = createElement("div", "faq-list");

    node.querySelectorAll(".rank-math-faq-item").forEach((item) => {
      const details = createElement("details", "faq-item");
      const summary = createElement("summary", "", item.querySelector(".rank-math-question")?.textContent?.trim() || "Question");
      const answer = createElement("div", "faq-answer");
      const answerNode = item.querySelector(".rank-math-answer");
      answer.innerHTML = answerNode ? answerNode.innerHTML : "";
      details.append(summary, answer);
      list.appendChild(details);
    });

    return list;
  }

  function buildSection(titleText){
    const section = createElement("section", "article-section");
    const heading = createElement("h2", "", titleText);
    heading.id = slugify(titleText);
    section.appendChild(heading);
    return { section, heading };
  }

  function buildHero(title, heroImage, intro, facts){
    const section = createElement("section", "hero-card");
    const copy = createElement("div", "hero-copy");
    const kicker = createElement("div", "hero-kicker", "Smoke Recipes Article");
    const heading = createElement("h1", "hero-title", title);

    copy.append(kicker, heading);

    intro.forEach((paragraph) => {
      const p = createElement("p", "hero-summary");
      p.innerHTML = paragraph.innerHTML;
      copy.appendChild(p);
    });

    const meta = createElement("div", "hero-meta");
    facts.forEach((fact) => {
      meta.appendChild(createElement("span", "hero-chip", fact));
    });

    copy.appendChild(meta);

    const visual = createElement("figure", "hero-visual");
    if(heroImage && heroImage.querySelector("img")){
      const image = cloneNode(heroImage.querySelector("img"));
      visual.appendChild(image);
      if(image.alt){
        visual.appendChild(createElement("figcaption", "hero-caption", image.alt));
      }
    }else{
      visual.appendChild(createElement("div", "image-fallback", "Smoke & Citrus"));
    }

    section.append(copy, visual);
    return section;
  }

  function makeFactData(nodes, intro){
    const wordCount = [...intro, ...nodes].reduce((count, node) => count + (node.textContent || "").trim().split(/\s+/).filter(Boolean).length, 0);
    const stepCount = nodes.filter((node) => node.tagName === "P" && /<strong>\s*Step\s+\d+:/i.test(node.innerHTML)).length;
    const faqBlock = nodes.find((node) => node.classList && node.classList.contains("wp-block-rank-math-faq-block"));
    const faqCount = faqBlock ? faqBlock.querySelectorAll(".rank-math-faq-item").length : 0;
    const sectionCount = nodes.filter((node) => node.tagName === "H2").length;
    const readMinutes = Math.max(1, Math.ceil(wordCount / 220));

    return [
      `${readMinutes} min read`,
      `${stepCount || 0} steps`,
      `${sectionCount || 0} sections`,
      `${faqCount || 0} FAQs`
    ];
  }

  function nextMeaningfulNode(nodes, startIndex){
    for(let index = startIndex; index < nodes.length; index += 1){
      const node = nodes[index];
      if(!node || !node.tagName){
        continue;
      }

      const text = (node.textContent || "").trim();
      if(node.tagName === "FIGURE" || text){
        return node;
      }
    }

    return null;
  }

  function buildArticle(nodes){
    const wrapper = createElement("div", "content-grid");
    const surface = createElement("div", "article-surface");
    const body = createElement("div", "article-body");
    body.id = "article-content";
    const sidebar = createElement("aside", "sidebar-stack");
    surface.appendChild(body);

    const tocEntries = [];
    let currentSection = null;

    for(let index = 0; index < nodes.length; index += 1){
      const node = nodes[index];
      if(!node.tagName){
        continue;
      }

      const text = node.textContent.trim();
      if(!text && node.tagName !== "FIGURE"){
        continue;
      }

      if(node.tagName === "H3" && /recipe summary/i.test(text)){
        const summary = buildSummaryCard(text, nodes, index + 1);
        if(summary.node){
          body.appendChild(summary.node);
        }
        index = summary.nextIndex - 1;
        continue;
      }

      if(node.tagName === "H3" && /a note from my kitchen/i.test(text)){
        const note = buildNoteCard(text, nodes, index + 1, "note-card");
        body.appendChild(note.node);
        index = note.nextIndex - 1;
        continue;
      }

      if(node.tagName === "H3" && /love this/i.test(text)){
        const closing = buildNoteCard(text, nodes, index + 1, "closing-card");
        body.appendChild(closing.node);
        index = closing.nextIndex - 1;
        continue;
      }

      if(node.tagName === "H2"){
        const built = buildSection(text);
        currentSection = built.section;
        body.appendChild(currentSection);
        tocEntries.push({ id: built.heading.id, label: text });
        continue;
      }

      if(node.classList && node.classList.contains("wp-block-rank-math-faq-block")){
        const faqList = buildFaqList(node);
        const faqHeading = currentSection && currentSection.querySelector("h2");
        if(faqHeading && /frequently asked questions/i.test(faqHeading.textContent)){
          faqHeading.id = faqHeading.id || "frequently-asked-questions";
          currentSection.appendChild(faqList);
        }else{
          const faqSection = createElement("section", "article-section");
          const title = createElement("h2", "", "Frequently Asked Questions");
          title.id = "frequently-asked-questions";
          faqSection.append(title, faqList);
          body.appendChild(faqSection);
          tocEntries.push({ id: title.id, label: "Frequently Asked Questions" });
        }
        continue;
      }

      if(node.tagName === "H6" || (node.tagName === "H1" && !text)){
        continue;
      }

      const target = currentSection || body;

      if(node.tagName === "FIGURE"){
        const nextNode = nextMeaningfulNode(nodes, index + 1);
        if(nextNode && nextNode.tagName === "H3" && /a note from my kitchen/i.test(nextNode.textContent.trim())){
          continue;
        }

        const image = node.querySelector("img");
        if(image){
          const figure = createElement("figure", "story-image");
          figure.appendChild(cloneNode(image));
          target.appendChild(figure);
        }
        continue;
      }

      if(node.tagName === "P" && /<strong>\s*Step\s+\d+:/i.test(node.innerHTML)){
        const card = createElement("div", "step-card");
        const p = createElement("p");
        p.innerHTML = node.innerHTML;
        card.appendChild(p);
        target.appendChild(card);
        continue;
      }

      target.appendChild(cloneNode(node));
    }

    const infoCard = createElement("section", "info-card");
    infoCard.innerHTML = '<h2>Quick facts</h2><div class="facts"></div>';
    const tocCard = createElement("nav", "toc-card");
    tocCard.innerHTML = '<h2>On this page</h2><div class="toc-list"></div>';

    sidebar.append(infoCard, tocCard);
    wrapper.append(surface, sidebar);

    return { wrapper, tocEntries, infoCard, tocCard };
  }

  function populateSidebar(infoCard, tocCard, facts, tocEntries){
    const factsWrap = infoCard.querySelector(".facts");
    facts.forEach((factText) => {
      const parts = factText.split(" ");
      const value = parts.shift();
      const item = createElement("div", "fact");
      item.innerHTML = `<span>${parts.join(" ")}</span><strong>${value}</strong>`;
      factsWrap.appendChild(item);
    });

    const tocWrap = tocCard.querySelector(".toc-list");
    if(tocEntries.length === 0){
      tocWrap.appendChild(createElement("p", "", "No section headings were found in this article."));
      return;
    }

    tocEntries.forEach((entry) => {
      const link = createElement("a", "", entry.label);
      link.href = `#${entry.id}`;
      tocWrap.appendChild(link);
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const link = tocWrap.querySelector(`a[href="#${entry.target.id}"]`);
        if(link){
          link.classList.toggle("active", entry.isIntersecting);
        }
      });
    }, { rootMargin: "-15% 0px -70% 0px", threshold: 0 });

    tocEntries.forEach((entry) => {
      const target = document.getElementById(entry.id);
      if(target){
        observer.observe(target);
      }
    });
  }

  async function loadArticle(){
    const fileName = readFileParam();
    if(!fileName){
      makeState("Recipe not found", "Open a recipe from the homepage so the viewer knows which untouched source file to render.");
      return;
    }

    try{
      const response = await fetch(fileName, { cache: "no-store" });
      if(!response.ok){
        throw new Error(`HTTP ${response.status}`);
      }

      const raw = maybeFixMojibake(await response.text());
      const parsed = new DOMParser().parseFromString(raw, "text/html");
      const redirectTarget = redirectTargetFromDocument(parsed);
      if(redirectTarget){
        window.location.replace(redirectTarget);
        return;
      }
      const sourceNodes = [...parsed.body.children].filter((node) => !["META", "SCRIPT", "STYLE"].includes(node.tagName));
      const { heroImage, intro, remaining } = extractIntro(sourceNodes);
      const facts = makeFactData(remaining, intro);
      const title = titleFromFilename(fileName);

      document.title = `${title} | Smoke Recipes`;

      const page = createElement("article", "recipe-page");
      page.appendChild(buildHero(title, heroImage, intro, facts));

      const article = buildArticle(remaining);
      page.appendChild(article.wrapper);
      app.innerHTML = "";
      app.className = "";
      app.appendChild(page);
      populateSidebar(article.infoCard, article.tocCard, facts, article.tocEntries);
    }catch(error){
      makeState("Recipe could not load", `The viewer could not fetch ${fileName}. ${String(error)}`);
    }
  }

  loadArticle();
})();
