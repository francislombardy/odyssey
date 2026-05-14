(() => {
  const mediaUrl = (path) => encodeURI(path).replace(/#/g, "%23");
  const pad = (value) => String(value).padStart(2, "0");
  const MAX_CLIENT_FILE_SIZE = 25 * 1024 * 1024;
  const ALLOWED_UPLOAD_EXTENSIONS = /\.(jpe?g|png|webp|gif|mp4|mov|webm)$/i;

  const captionSets = {
    hospitalitySpaces: [
      "Spaces with presence",
      "Designed for arrival",
      "Stay, seen beautifully"
    ],
    commercialEditorial: [
      "Product, plated with intention",
      "Built for desire",
      "Editorial details"
    ],
    lifestylePortraits: [
      "People, presence, story",
      "Character in focus",
      "Lifestyle with intention"
    ],
    videography: [
      "Motion with purpose",
      "Stories in motion",
      "Campaign-ready visuals"
    ]
  };

  const imageItems = (folder, files, options) =>
    files.slice(0, 12).map((fileName, index) => {
      const number = pad(index + 1);
      const caption = options.captions[index % options.captions.length];

      return {
        type: "image",
        src: mediaUrl(`images/${folder}/${fileName}`),
        title: caption,
        detail: options.detail,
        alt: `${options.altBase} ${number} for the ${options.detail} portfolio by Odyssey in Cape Town.`
      };
    });

  const videoItems = (folder, files) =>
    files.slice(0, 8).map((fileName, index) => {
      const number = pad(index + 1);
      const extension = fileName.split(".").pop().toLowerCase();
      const caption = captionSets.videography[index % captionSets.videography.length];

      return {
        type: "video",
        src: mediaUrl(`images/${folder}/${fileName}`),
        sourceKey: `images/${folder}/${fileName}`,
        mime: extension === "mov" ? "video/quicktime" : `video/${extension}`,
        title: caption,
        detail: "Videography",
        alt: `Short-form hospitality and lifestyle video campaign ${number} for the Videography portfolio by Odyssey in Cape Town.`
      };
    });

  const portfolioItems = {
    hospitalitySpaces: imageItems("hospitalityspaces", [
      "IMG_4071.jpg",
      "IMG_4078.jpg",
      "IMG_4170.jpg",
      "IMG_5160-Enhanced-NR.jpg",
      "IMG_5190-Enhanced-NR.jpg",
      "IMG_5207-Enhanced-NR.jpg",
      "IMG_5218-Enhanced-NR.jpg",
      "IMG_7865.jpg"
    ], {
      detail: "Hospitality & Spaces",
      captions: captionSets.hospitalitySpaces,
      altBase: "Hospitality interior and accommodation space photography"
    }),
    commercialEditorial: imageItems("commercial editorial", [
      "IMG_4822-Enhanced-NR.jpg",
      "IMG_5274-Enhanced-NR.jpg",
      "IMG_5324.jpg",
      "IMG_5455.jpg",
      "IMG_5595.jpg",
      "IMG_5751.jpg",
      "IMG_5927.jpg",
      "IMG_6335.jpg",
      "IMG_6446.jpg",
      "IMG_7571.jpg",
      "IMG_7964.jpg",
      "IMG_8098.jpg"
    ], {
      detail: "Commercial & Editorial",
      captions: captionSets.commercialEditorial,
      altBase: "Commercial food, drink and editorial brand content photography"
    }),
    lifestylePortraits: imageItems("portraitlifestyle", [
      "IMG_3494.jpg",
      "IMG_5747.jpg",
      "IMG_6035-2.jpg",
      "IMG_6166.jpg",
      "IMG_7588.jpg",
      "IMG_8010.jpg"
    ], {
      detail: "Lifestyle & Portraits",
      captions: captionSets.lifestylePortraits,
      altBase: "Lifestyle portrait and personal brand photography"
    }),
    videography: videoItems("videos", [
      "1110.mp4",
      "1119.mp4",
      "RODIZIO TRIAL VID.mp4",
      "UO HOTEL ROOM.mp4",
      "Urban - Nat checkin.mp4",
      "urbanbrunchbuffet.mp4",
      "VIC KING VID.mp4",
      "VID AD 1.mp4"
    ])
  };

  const portfolioCategories = [
    {
      heading: "PHOTOGRAPHY / HOSPITALITY & SPACES",
      items: portfolioItems.hospitalitySpaces
    },
    {
      heading: "PHOTOGRAPHY / COMMERCIAL & EDITORIAL",
      items: portfolioItems.commercialEditorial
    },
    {
      heading: "PHOTOGRAPHY / LIFESTYLE & PORTRAITS",
      items: portfolioItems.lifestylePortraits
    },
    {
      heading: "VIDEOGRAPHY",
      video: true,
      items: portfolioItems.videography
    }
  ];

  const header = document.querySelector("[data-header]");
  const menu = document.querySelector("[data-menu]");
  const menuToggle = document.querySelector("[data-menu-toggle]");
  const portfolioRoot = document.querySelector("[data-portfolio]");
  const leadForm = document.querySelector("[data-lead-form]");
  const year = document.querySelector("[data-year]");
  let videoManifest = { videos: {} };

  const setHeaderState = () => {
    if (!header) return;
    header.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  const closeMenu = () => {
    if (!menu || !menuToggle) return;
    document.body.classList.remove("menu-open");
    menu.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
  };

  const toggleMenu = () => {
    if (!menu || !menuToggle) return;
    const isOpen = menu.classList.toggle("is-open");
    document.body.classList.toggle("menu-open", isOpen);
    menuToggle.setAttribute("aria-expanded", String(isOpen));
  };

  const createPosterDataUri = (title) => {
    const w = 1600;
    const h = 900;
    const fg = "#ff7a00";
    const txt = String(title || "");
    const svg = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}'>
        <rect width='100%' height='100%' fill='#0b0b0b' />
        <text x='50%' y='50%' fill='${fg}' font-family='-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Inter, Arial' font-weight='700' font-size='40' text-anchor='middle' dominant-baseline='middle'>${txt}</text>
      </svg>
    `;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  };

  const loadVideoManifest = async () => {
    try {
      const response = await fetch("/images/video-manifest.json", { cache: "no-cache" });
      if (!response.ok) return { videos: {} };
      return await response.json();
    } catch {
      return { videos: {} };
    }
  };

  const resolveVideoAsset = (item) => {
    const entry = videoManifest.videos?.[item.sourceKey];

    if (!entry || !entry.outputs || !Object.keys(entry.outputs).length) {
      console.warn(`Using raw portfolio video fallback for ${item.sourceKey}. Run npm run optimize:videos.`);
      return {
        optimized: false,
        poster: createPosterDataUri(item.title),
        sources: [
          {
            src: item.src,
            type: item.mime
          }
        ]
      };
    }

    const outputs = Object.values(entry.outputs)
      .filter((output) => output && output.src)
      .sort((a, b) => {
        if (a.width !== b.width) return a.width - b.width;
        if (a.format === b.format) return 0;
        return a.format === "webm" ? -1 : 1;
      });
    const hasLargerOutput = outputs.some((output) => output.width > 720);

    return {
      optimized: true,
      poster: entry.poster?.src ? mediaUrl(entry.poster.src) : createPosterDataUri(item.title),
      sources: outputs.map((output) => ({
        src: mediaUrl(output.src),
        type: output.format === "webm" ? "video/webm" : "video/mp4",
        media: output.width <= 720 && hasLargerOutput ? "(max-width: 760px)" : ""
      }))
    };
  };

  const showGroup = (group, subcatSlug = "all") => {
    portfolioRoot.querySelectorAll(".portfolio-category").forEach((section) => {
      const isGroup = section.dataset.group === group;
      if (!isGroup) {
        section.hidden = true;
        return;
      }

      if (group === "photography") {
        if (subcatSlug === "all") {
          section.hidden = false;
        } else {
          section.hidden = section.dataset.subcategorySlug !== subcatSlug;
        }
      } else {
        section.hidden = false;
      }
    });
  };

  const initPortfolioControls = () => {
    const controls = document.querySelector("[data-portfolio-controls]");
    if (!controls) return;
    const tabs = Array.from(controls.querySelectorAll("[data-portfolio-tab]"));
    const filtersWrap = controls.querySelector("[data-portfolio-filters]");

    // build photo category filters
    const photoCats = portfolioCategories.filter((c) => !c.video);
    filtersWrap.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.type = "button";
    allBtn.className = "filter-btn is-active";
    allBtn.dataset.filter = "all";
    allBtn.textContent = "All";
    filtersWrap.append(allBtn);

    photoCats.forEach((cat) => {
      const name = cat.heading.split("/").pop().trim();
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "filter-btn";
      btn.dataset.filter = slug;
      btn.textContent = name;
      filtersWrap.append(btn);
    });

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.toggle("is-active", t === tab));
        const group = tab.dataset.portfolioTab;
        filtersWrap.style.display = group === "photography" ? "flex" : "none";
        // reset photo filters to all when switching
        filtersWrap.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("is-active"));
        const first = filtersWrap.querySelector(".filter-btn");
        if (first) first.classList.add("is-active");
        showGroup(group, "all");
      });
    });

    filtersWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      filtersWrap.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      const filter = btn.dataset.filter || "all";
      showGroup("photography", filter);
    });

    // initial state
    filtersWrap.style.display = "flex";
    showGroup("photography", "all");
  };

  const loadDeferredVideo = (video) => {
    const sources = Array.from(video.querySelectorAll("source[data-src]")).filter((source) => !source.src);
    if (!sources.length) return;

    sources.forEach((source) => {
      source.src = source.dataset.src;
    });
    video.load();
  };

  const renderPortfolio = () => {
    if (!portfolioRoot) return;

    portfolioRoot.innerHTML = "";
    const fragment = document.createDocumentFragment();

    portfolioCategories.forEach((category) => {
      const section = document.createElement("article");
      section.className = "portfolio-category";
      const isVideo = Boolean(category.video);
      section.dataset.group = isVideo ? "videography" : "photography";
      const subName = category.heading.split("/").pop().trim();
      section.dataset.subcategory = subName;
      section.dataset.subcategorySlug = subName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const headerRow = document.createElement("div");
      headerRow.className = "portfolio-category__header";
      headerRow.innerHTML = `
        <span class="portfolio-category__title">${category.heading}</span>
        <span class="portfolio-category__line" aria-hidden="true"></span>
        <span class="portfolio-category__count">${category.items.length} ${isVideo ? "VIDEOS" : "IMAGES"}</span>
      `;

      const grid = document.createElement("div");
      grid.className = isVideo ? "portfolio-grid portfolio-grid--video" : "portfolio-grid";

      category.items.forEach((item) => {
        const card = document.createElement("article");
        card.className = "portfolio-card";
        card.dataset.fallback = item.title;
        card.dataset.type = item.type;
        card.dataset.subcategory = section.dataset.subcategory;
        card.dataset.subcategorySlug = section.dataset.subcategorySlug;

        let media;

        if (item.type === "video") {
          const videoAsset = resolveVideoAsset(item);
          card.tabIndex = 0;
          card.setAttribute("role", "button");
          card.setAttribute("aria-label", `Play ${item.alt}`);
          card.dataset.optimized = String(videoAsset.optimized);
          media = document.createElement("video");
          media.preload = "none";
          media.playsInline = true;
          media.muted = true;
          media.setAttribute("aria-label", item.alt);
          media.title = item.alt;
          videoAsset.sources.forEach((source) => {
            const srcNode = document.createElement("source");
            srcNode.dataset.src = source.src;
            srcNode.type = source.type;
            if (source.media) {
              srcNode.media = source.media;
            }
            media.appendChild(srcNode);
          });
          media.poster = videoAsset.poster;

          media.addEventListener("play", () => {
            card.classList.add("is-playing");
            media.controls = true;
          });
          media.addEventListener("pause", () => {
            card.classList.remove("is-playing");
          });
        } else {
          media = document.createElement("img");
          media.src = item.src;
          media.alt = item.alt;
          media.title = item.alt;
          media.loading = "lazy";
          media.decoding = "async";
        }

        media.addEventListener("error", () => {
          card.classList.add("is-fallback");
        });

        const caption = document.createElement("div");
        caption.className = "portfolio-card__caption";
        caption.innerHTML = `
          <div>
            <strong>${item.title}</strong>
            <span>${item.detail}</span>
          </div>
          ${isVideo ? '<span class="play-icon" aria-hidden="true">&#9658;</span>' : ""}
        `;

        if (item.type === "video") {
          const toggleVideo = () => {
            if (media.paused) {
              loadDeferredVideo(media);
              media.play().catch(() => {
                media.controls = true;
              });
            } else {
              media.pause();
            }
          };

          card.addEventListener("click", toggleVideo);
          card.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleVideo();
            }
          });
        }

        card.append(media, caption);
        grid.append(card);
      });

      section.append(headerRow, grid);
      fragment.append(section);
    });

    portfolioRoot.append(fragment);

    // Lazy-load video sources when they approach the viewport
    const io = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const vid = entry.target;
        loadDeferredVideo(vid);
        observer.unobserve(vid);
      });
    }, { rootMargin: "200px 0px", threshold: 0.08 });

    portfolioRoot.querySelectorAll("video").forEach((v) => io.observe(v));

    // Ensure only one video plays at a time inside portfolio
    portfolioRoot.addEventListener("play", (e) => {
      if (e.target.tagName !== "VIDEO") return;
      portfolioRoot.querySelectorAll("video").forEach((other) => {
        if (other !== e.target) other.pause();
      });
    }, true);

    window.ODYSSEY_PORTFOLIO_TOTAL = portfolioCategories.reduce((total, category) => total + category.items.length, 0);

    // init controls after DOM is available
    initPortfolioControls();
  };

  const trackEvent = (eventName, payload = {}) => {
    if (!eventName) return;

    const eventPayload = {
      ...payload,
      page: window.location.pathname,
      title: document.title
    };

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: eventName, ...eventPayload });

    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, eventPayload);
    }

    fetch("/api/tracking/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventName,
        path: window.location.pathname,
        payload: eventPayload
      }),
      keepalive: true
    }).catch(() => {});
  };

  window.odysseyTrack = trackEvent;

  const initTracking = () => {
    const pageEventNode = document.querySelector("[data-page-event]");
    if (pageEventNode) {
      trackEvent(pageEventNode.dataset.pageEvent, {
        pageName: pageEventNode.dataset.pageName || window.location.pathname
      });
    }

    document.addEventListener("click", (event) => {
      const trackedNode = event.target.closest("[data-track]");
      if (trackedNode) {
        trackEvent(trackedNode.dataset.track, {
          label: trackedNode.textContent.trim(),
          href: trackedNode.getAttribute("href") || ""
        });
      }

      const businessAction = event.target.closest("[data-business-action]");
      if (businessAction) {
        trackEvent(`business_${businessAction.dataset.businessAction}_click`, {
          businessName: businessAction.dataset.businessName || "",
          href: businessAction.getAttribute("href") || ""
        });
      }
    });
  };

  const validateField = (field) => {
    const isValid = field.checkValidity();
    field.setAttribute("aria-invalid", String(!isValid));
    return isValid;
  };

  const setFormStatus = (status, message, type = "") => {
    if (!status) return;
    status.textContent = message;
    status.className = `form-status${type ? ` is-${type}` : ""}`;
  };

  const setValidationStatus = (status, data, fallback = "Something went wrong. Please try again.") => {
    if (!status) return;
    const details = Array.isArray(data.details) ? data.details.filter(Boolean) : [];

    if (!details.length) {
      setFormStatus(status, data.error || fallback, "error");
      return;
    }

    status.className = "form-status is-error";
    status.innerHTML = `
      <span>Please check the following:</span>
      <ul>${details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>
    `;
  };

  const clearHoneypotFields = (form) => {
    form.querySelectorAll('[data-honeypot], [name="companyWebsite"]').forEach((field) => {
      field.value = "";
    });
  };

  const setSourcePage = (form) => {
    const sourcePage = form.querySelector("[data-source-page]");
    if (sourcePage) {
      sourcePage.value = window.location.pathname || "/";
    }
  };

  const inferFieldFromError = (form, detail) => {
    const text = String(detail || "").toLowerCase();
    const rules = [
      ["full name", "fullName"],
      ["email address", "email"],
      ["contact email", "contactEmail"],
      ["email", "email"],
      ["phone", "phone"],
      ["contact person phone", "contactPhone"],
      ["business name", "businessName"],
      ["business type", "businessType"],
      ["business category", "businessCategory"],
      ["business location", "businessLocation"],
      ["business address", "businessAddress"],
      ["service interested", "service"],
      ["instagram", "instagramLink"],
      ["tiktok", "tiktokLink"],
      ["website", "websiteLink"],
      ["booking link", "bookingLink"],
      ["whatsapp", "whatsappLink"],
      ["short business description", "businessDescription"],
      ["unique", "uniqueValue"],
      ["main products", "mainProductsServices"],
      ["target audience", "targetAudience"],
      ["content caption", "contentCaption"],
      ["content upload", "contentFiles"],
      ["message", "message"],
      ["partnership", "partnershipType"],
      ["company", "companyName"]
    ];
    const match = rules.find(([needle, name]) => text.includes(needle) && form.elements[name]);
    return match ? form.elements[match[1]] : null;
  };

  const markBackendErrors = (form, details = []) => {
    details.forEach((detail) => {
      const field = inferFieldFromError(form, detail);
      if (field) {
        field.setAttribute("aria-invalid", "true");
      }
    });
  };

  const submitBackendForm = async (form, options = {}) => {
    const requiredFields = Array.from(form.querySelectorAll("[required]"));
    const status = form.querySelector("[data-form-status]");
    const submitButton = form.querySelector('button[type="submit"]');
    const firstInvalid = requiredFields.find((field) => !validateField(field));

    if (firstInvalid) {
      setFormStatus(status, "Please complete the required fields before submitting.", "error");
      firstInvalid.focus();
      return;
    }

    const fileError = validateFiles(form);
    if (fileError) {
      setFormStatus(status, fileError, "error");
      return;
    }

    clearHoneypotFields(form);
    setSourcePage(form);
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add("is-loading");
    }
    setFormStatus(status, "Submitting securely...", "");

    try {
      const response = await fetch(form.action, {
        method: form.method || "POST",
        body: new FormData(form),
        credentials: "same-origin"
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        markBackendErrors(form, data.details);
        setValidationStatus(status, data);
        return;
      }

      trackEvent(options.successEvent || form.dataset.successEvent, { submissionId: data.id || "" });
      form.reset();
      if (options.resetStartTime) options.resetStartTime();
      setSourcePage(form);
      setFormStatus(
        status,
        data.message || "Thank you. Your submission has been received and will be reviewed by Odyssey.",
        "success"
      );
    } catch (error) {
      setFormStatus(status, error.message || "Something went wrong. Please try again.", "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove("is-loading");
      }
    }
  };

  const initLeadForm = () => {
    if (!leadForm) return;

    const requiredFields = Array.from(leadForm.querySelectorAll("[required]"));
    const status = leadForm.querySelector("[data-form-status]");
    const startedAt = leadForm.querySelector("[data-form-started-at]");

    const stampStartTime = () => {
      if (startedAt) startedAt.value = String(Date.now());
    };

    stampStartTime();
    setSourcePage(leadForm);

    requiredFields.forEach((field) => {
      const clearFieldState = () => {
        field.removeAttribute("aria-invalid");
        setFormStatus(status, "");
      };

      field.addEventListener("input", clearFieldState);
      field.addEventListener("change", clearFieldState);
    });

    leadForm.addEventListener("submit", (event) => {
      event.preventDefault();
      submitBackendForm(leadForm, {
        successEvent: "contact_enquiry",
        resetStartTime: stampStartTime
      });
    });
  };

  const validateFiles = (form) => {
    const files = Array.from(form.querySelectorAll('input[type="file"]')).flatMap((input) =>
      Array.from(input.files || [])
    );

    const invalidFile = files.find((file) => file.size > MAX_CLIENT_FILE_SIZE || !ALLOWED_UPLOAD_EXTENSIONS.test(file.name));
    if (!invalidFile) return "";

    if (invalidFile.size > MAX_CLIENT_FILE_SIZE) {
      return `${invalidFile.name} is larger than 25MB.`;
    }

    return `${invalidFile.name} is not an allowed file type.`;
  };

  const initSubmissionForms = () => {
    document.querySelectorAll("[data-submission-form]").forEach((form) => {
      const requiredFields = Array.from(form.querySelectorAll("[required]"));
      const status = form.querySelector("[data-form-status]");
      const submitButton = form.querySelector('button[type="submit"]');
      const startedAt = form.querySelector("[data-form-started-at]");

      const stampStartTime = () => {
        if (startedAt) startedAt.value = String(Date.now());
      };

      stampStartTime();

      requiredFields.forEach((field) => {
        const clearFieldState = () => {
          field.removeAttribute("aria-invalid");
          setFormStatus(status, "");
        };

        field.addEventListener("input", clearFieldState);
        field.addEventListener("change", clearFieldState);
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitBackendForm(form, {
          successEvent: form.dataset.successEvent,
          resetStartTime: stampStartTime
        });
      });
    });
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
  };

  const formatDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const statusOptionsHtml = (options, current) =>
    options.map((option) => `<option${option === current ? " selected" : ""}>${escapeHtml(option)}</option>`).join("");

  const mediaLinksHtml = (media = []) => {
    if (!media.length) return "<span class=\"muted-cell\">No uploads</span>";

    return media
      .map(
        (file, index) =>
          `<a href="${escapeHtml(file.url)}" target="_blank" rel="noopener">${escapeHtml(file.field)} ${index + 1}</a>`
      )
      .join("");
  };

  const adminColumns = {
    contacts: [
      "Lead",
      "Business",
      "Service",
      "Message",
      "Source",
      "Submitted",
      "Status",
      "Notes",
      "Save"
    ],
    business: [
      "Business",
      "Category",
      "Contact",
      "Location",
      "Submitted",
      "Shoot",
      "Publication",
      "Media",
      "Status",
      "Notes",
      "Save"
    ],
    creators: [
      "Creator",
      "Channels",
      "Location",
      "Content",
      "Submitted",
      "Program",
      "Paid",
      "Media",
      "Status",
      "Notes",
      "Save"
    ],
    partners: [
      "Company / venue",
      "Contact",
      "Partnership type",
      "Submitted",
      "Status",
      "Notes",
      "Save"
    ]
  };

  const emptyAdminMessage = {
    contacts: "No general enquiries yet.",
    business: "No business submissions yet.",
    creators: "No creator submissions yet.",
    partners: "No partnership enquiries yet."
  };

  const renderContactRow = (row, statusOptions) => `
    <tr data-row-id="${escapeHtml(row.id)}">
      <td><strong>${escapeHtml(row.full_name)}</strong><small>${escapeHtml(row.email)}<br>${escapeHtml(row.phone)}</small></td>
      <td>${escapeHtml(row.business_name)}<small>${escapeHtml(row.business_type)}</small></td>
      <td>${escapeHtml(row.service_interested_in)}</td>
      <td>${escapeHtml(row.message)}</td>
      <td>${escapeHtml(row.source_page)}</td>
      <td>${formatDate(row.submitted_at)}</td>
      <td><select name="status">${statusOptionsHtml(statusOptions, row.status)}</select></td>
      <td><textarea name="notes" rows="3">${escapeHtml(row.notes)}</textarea></td>
      <td><button class="button button--dark admin-save" type="button">Save</button></td>
    </tr>
  `;

  const renderBusinessRow = (row, statusOptions) => `
    <tr data-row-id="${escapeHtml(row.id)}">
      <td><strong>${escapeHtml(row.business_name)}</strong><small>${escapeHtml(row.email)}</small></td>
      <td>${escapeHtml(row.category)}</td>
      <td>${escapeHtml(row.contact_name)}<small>${escapeHtml(row.phone)}</small></td>
      <td>${escapeHtml(row.location)}<small>${escapeHtml(row.address)}</small></td>
      <td>${formatDate(row.submitted_at)}</td>
      <td>${escapeHtml(row.complimentary_shoot)}</td>
      <td><input class="admin-inline-input" name="profilePublicationStatus" value="${escapeHtml(row.profile_publication_status)}"></td>
      <td class="admin-media-links">${mediaLinksHtml(row.media)}</td>
      <td><select name="status">${statusOptionsHtml(statusOptions, row.status)}</select></td>
      <td><textarea name="notes" rows="3">${escapeHtml(row.notes)}</textarea></td>
      <td><button class="button button--dark admin-save" type="button">Save</button></td>
    </tr>
  `;

  const renderCreatorRow = (row, statusOptions) => `
    <tr data-row-id="${escapeHtml(row.id)}">
      <td><strong>${escapeHtml(row.full_name)}</strong><small>${escapeHtml(row.email)}<br>${escapeHtml(row.phone)}</small></td>
      <td>${escapeHtml(row.instagram_handle)}<small>${escapeHtml(row.tiktok_handle)}</small></td>
      <td>${escapeHtml(row.location)}</td>
      <td>${escapeHtml(row.content_type)}<small>${escapeHtml(row.audience_size)}</small></td>
      <td>${formatDate(row.submitted_at)}</td>
      <td><input class="admin-inline-input" name="creatorProgramStatus" value="${escapeHtml(row.creator_program_status)}"></td>
      <td>${escapeHtml(row.open_to_paid_collabs)}</td>
      <td class="admin-media-links">${mediaLinksHtml(row.media)}</td>
      <td><select name="status">${statusOptionsHtml(statusOptions, row.status)}</select></td>
      <td><textarea name="notes" rows="3">${escapeHtml(row.notes)}</textarea></td>
      <td><button class="button button--dark admin-save" type="button">Save</button></td>
    </tr>
  `;

  const renderPartnerRow = (row, statusOptions) => `
    <tr data-row-id="${escapeHtml(row.id)}">
      <td><strong>${escapeHtml(row.company_name)}</strong><small>${escapeHtml(row.message)}</small></td>
      <td>${escapeHtml(row.name)}<small>${escapeHtml(row.email)}<br>${escapeHtml(row.phone)}</small></td>
      <td>${escapeHtml(row.partnership_type)}</td>
      <td>${formatDate(row.submitted_at)}</td>
      <td><select name="status">${statusOptionsHtml(statusOptions, row.status)}</select></td>
      <td><textarea name="notes" rows="3">${escapeHtml(row.notes)}</textarea></td>
      <td><button class="button button--dark admin-save" type="button">Save</button></td>
    </tr>
  `;

  const renderAdminTable = (type, rows, statusOptions) => {
    if (!rows.length) {
      return `<div class="admin-empty">${emptyAdminMessage[type]}</div>`;
    }

    const rowHtml = rows
      .map((row) => {
        if (type === "contacts") return renderContactRow(row, statusOptions);
        if (type === "business") return renderBusinessRow(row, statusOptions);
        if (type === "creators") return renderCreatorRow(row, statusOptions);
        return renderPartnerRow(row, statusOptions);
      })
      .join("");

    return `
      <table class="admin-table" data-current-type="${escapeHtml(type)}">
        <thead>
          <tr>${adminColumns[type].map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
    `;
  };

  const initAdminDashboard = () => {
    const adminRoot = document.querySelector("[data-admin-dashboard]");
    if (!adminRoot) return;

    const authPanel = document.querySelector("[data-admin-auth]");
    const adminPanel = document.querySelector("[data-admin-panel]");
    const loginForm = document.querySelector("[data-admin-login]");
    const logoutButton = document.querySelector("[data-admin-logout]");
    const tableWrap = document.querySelector("[data-admin-table]");
    const tableStatus = document.querySelector("[data-admin-table-status]");
    const tabButtons = Array.from(document.querySelectorAll("[data-admin-tab]"));
    const countNodes = {
      contacts: document.querySelector('[data-admin-count="contacts"]'),
      business: document.querySelector('[data-admin-count="business"]'),
      creators: document.querySelector('[data-admin-count="creators"]'),
      partners: document.querySelector('[data-admin-count="partners"]')
    };
    let currentType = "contacts";
    let statusOptions = [];

    const showAdmin = (show) => {
      authPanel.hidden = show;
      adminPanel.hidden = !show;
      if (logoutButton) logoutButton.hidden = !show;
    };

    const setTableStatus = (message, type = "") => {
      tableStatus.textContent = message;
      tableStatus.className = `admin-table-status${type ? ` is-${type}` : ""}`;
    };

    const loadType = async (type) => {
      currentType = type;
      setTableStatus("Loading submissions...");
      tableWrap.innerHTML = "";

      const data = await fetchJson(`/api/admin/submissions/${type}`);
      statusOptions = data.statusOptions || statusOptions;
      if (countNodes[type]) countNodes[type].textContent = String(data.rows.length);
      tableWrap.innerHTML = renderAdminTable(type, data.rows, statusOptions);
      setTableStatus(`${data.rows.length} ${data.rows.length === 1 ? "record" : "records"} loaded.`, "success");
    };

    const loadCounts = async () => {
      await Promise.all(
        Object.keys(countNodes).map(async (type) => {
          const data = await fetchJson(`/api/admin/submissions/${type}`);
          if (countNodes[type]) countNodes[type].textContent = String(data.rows.length);
        })
      );
    };

    const activateTab = async (button) => {
      tabButtons.forEach((tab) => {
        const isActive = tab === button;
        tab.classList.toggle("is-active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });
      await loadType(button.dataset.adminTab);
    };

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const status = loginForm.querySelector("[data-form-status]");
      const password = loginForm.elements.password.value;

      try {
        setFormStatus(status, "Checking access...");
        await fetchJson("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ password })
        });
        loginForm.reset();
        showAdmin(true);
        await loadCounts();
        await loadType(currentType);
      } catch (error) {
        setFormStatus(status, error.message || "Login failed.", "error");
      }
    });

    if (logoutButton) {
      logoutButton.addEventListener("click", async () => {
        await fetchJson("/api/admin/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => {});
        showAdmin(false);
      });
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        activateTab(button).catch((error) => setTableStatus(error.message, "error"));
      });
    });

    tableWrap.addEventListener("click", async (event) => {
      const saveButton = event.target.closest(".admin-save");
      if (!saveButton) return;

      const row = saveButton.closest("tr");
      const table = saveButton.closest("table");
      const type = table.dataset.currentType;
      const id = row.dataset.rowId;
      const payload = {
        status: row.querySelector('[name="status"]')?.value || "",
        notes: row.querySelector('[name="notes"]')?.value || ""
      };

      if (type === "business") {
        payload.profilePublicationStatus = row.querySelector('[name="profilePublicationStatus"]')?.value || "";
      }
      if (type === "creators") {
        payload.creatorProgramStatus = row.querySelector('[name="creatorProgramStatus"]')?.value || "";
      }

      saveButton.disabled = true;
      setTableStatus("Saving update...");

      try {
        await fetchJson(`/api/admin/submissions/${type}/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setTableStatus("Update saved.", "success");
      } catch (error) {
        setTableStatus(error.message || "Could not save update.", "error");
      } finally {
        saveButton.disabled = false;
      }
    });

    fetchJson("/api/admin/session")
      .then(async (session) => {
        showAdmin(session.authenticated);
        if (session.authenticated) {
          await loadCounts();
          await loadType(currentType);
        }
      })
      .catch(() => showAdmin(false));
  };

  const init = async () => {
    videoManifest = await loadVideoManifest();
    renderPortfolio();
    initTracking();
    initLeadForm();
    initSubmissionForms();
    initAdminDashboard();
    setHeaderState();

    if (year) {
      year.textContent = String(new Date().getFullYear());
    }
  };

  init();

  window.addEventListener("scroll", setHeaderState, { passive: true });

  if (menuToggle) {
    menuToggle.addEventListener("click", toggleMenu);
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", () => {
      closeMenu();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
    }
  });
})();
