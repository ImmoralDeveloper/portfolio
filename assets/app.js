const DEFAULT_LANGUAGE = "en";
const SUPPORTED_LANGUAGES = ["en", "es"];
const LANGUAGE_STORAGE_KEY = "portfolio-language";
const LANGUAGE_CHANGE_EVENT = "portfolio:languagechange";
const TRANSLATIONS_URL = new URL("./translations.json", import.meta.url);
const PROGRAMMING_START_YEAR = 2021;
const PROGRAMMING_START_MONTH = 11;
const CONTACT_CODE_OFFSET = 9;

const originalTextNodes = new WeakMap();
const originalAttributes = new WeakMap();
const protectedContactCache = {};

const PROTECTED_CONTACT_CODES = {
  digits: [62, 58, 66, 66, 65, 58, 64, 64, 65, 59, 63],
  phoneDisplay: [52, 62, 58, 41, 66, 66, 65, 58, 64, 64, 65, 59, 63],
  telegram: [114, 118, 118, 120, 123, 106, 117, 109, 110, 127, 110, 117, 120, 121, 110, 123],
  emailDisplay: [112, 114, 120, 127, 106, 119, 119, 114, 73, 114, 118, 118, 120, 123, 106, 117, 55, 109, 110, 127],
  emailAction: [108, 120, 119, 125, 106, 108, 125, 120, 73, 114, 118, 118, 120, 123, 106, 117, 55, 109, 110, 127],
};

const PROTECTED_CONTACT_LINKS = {
  whatsapp: () => `https://wa.me/${getProtectedContactValue("digits")}`,
  phone: () => `tel:+${getProtectedContactValue("digits")}`,
  telegram: () => `https://t.me/${getProtectedContactValue("telegram")}`,
  emailAction: () => `mailto:${getProtectedContactValue("emailAction")}`,
  emailContact: () => `mailto:${getProtectedContactValue("emailAction")}`,
};

const PROTECTED_CONTACT_TEXT = {
  phone: () => getProtectedContactValue("phoneDisplay"),
  telegram: () => `@${getProtectedContactValue("telegram")}`,
  emailDisplay: () => getProtectedContactValue("emailDisplay"),
};

const TEXT_TRANSLATION_ALIASES = [
  { text: "Let\u2019s Talk", key: "contact.title" },
  { text: "Let\u00e2\u20ac\u2122s Talk", key: "contact.title" },
];
const STATIC_TEXT_TRANSLATIONS = {
  ", All Rights Reserved": {
    en: ", All Rights Reserved",
    es: ", Todos los derechos reservados",
  },
  "\u00e2\u2020\u2014": { en: "\u2197", es: "\u2197" },
};

let translations = {};
let textTranslations = {};
let currentLanguage = getSavedLanguage();

async function loadTranslations() {
  const response = await fetch(TRANSLATIONS_URL);

  if (!response.ok) {
    throw new Error(`Could not load ${TRANSLATIONS_URL.pathname}`);
  }

  return response.json();
}

function collectTextTranslations(source, result = {}) {
  Object.values(source).forEach((value) => {
    if (!value || typeof value !== "object") {
      return;
    }

    if (typeof value.en === "string" && typeof value.es === "string") {
      result[value.en] = value;
      return;
    }

    collectTextTranslations(value, result);
  });

  return result;
}

function getTranslationEntry(path, source = translations) {
  return path.split(".").reduce((group, key) => group?.[key], source);
}

function buildTextTranslations(source) {
  const result = collectTextTranslations(source);

  TEXT_TRANSLATION_ALIASES.forEach(({ text, key }) => {
    const entry = getTranslationEntry(key, source);

    if (entry) {
      result[text] = entry;
    }
  });

  return Object.assign(result, STATIC_TEXT_TRANSLATIONS);
}

function normalizeText(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

function getSavedLanguage() {
  try {
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(savedLanguage) ? savedLanguage : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function saveLanguage(language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Browsers can block storage in private contexts; the page still works.
  }
}

function getProtectedContactValue(key) {
  if (protectedContactCache[key]) {
    return protectedContactCache[key];
  }

  const codes = PROTECTED_CONTACT_CODES[key] ?? [];
  const value = codes.map((code) => String.fromCharCode(code - CONTACT_CODE_OFFSET)).join("");

  protectedContactCache[key] = value;
  return value;
}

function initProtectedContacts() {
  document.querySelectorAll("[data-contact-link]").forEach((element) => {
    const buildHref = PROTECTED_CONTACT_LINKS[element.dataset.contactLink];

    if (buildHref) {
      element.href = buildHref();
    }
  });

  document.querySelectorAll("[data-contact-text]").forEach((element) => {
    const buildText = PROTECTED_CONTACT_TEXT[element.dataset.contactText];

    if (buildText) {
      element.textContent = buildText();
    }
  });
}

function getRoundedProgrammingYears(date = new Date()) {
  const elapsedMonths =
    (date.getFullYear() - PROGRAMMING_START_YEAR) * 12 + (date.getMonth() - PROGRAMMING_START_MONTH);

  return Math.max(0, Math.ceil(elapsedMonths / 12));
}

function updateDynamicYears() {
  const years = String(getRoundedProgrammingYears());

  document.querySelectorAll(".dynamic-years").forEach((element) => {
    element.textContent = years;
  });
}

function updateCurrentYear() {
  const year = String(new Date().getFullYear());

  document.querySelectorAll(".dynamic-current-year").forEach((element) => {
    element.textContent = year;
  });
}

function translateText(value, language = currentLanguage) {
  const normalizedValue = normalizeText(value);
  return textTranslations[normalizedValue]?.[language] ?? normalizedValue;
}

function translateKey(path, language = currentLanguage) {
  const entry = getTranslationEntry(path);
  return entry?.[language] ?? path;
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement;

  return (
    !parent ||
    !normalizeText(node.textContent) ||
    ["SCRIPT", "STYLE", "NOSCRIPT", "SVG"].includes(parent.tagName) ||
    parent.closest("[data-no-translate]")
  );
}

function translateTextNodes(language) {
  if (!document.body) {
    return;
  }

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return shouldSkipTextNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!originalTextNodes.has(node)) {
      originalTextNodes.set(node, {
        key: normalizeText(node.textContent),
        leadingSpace: node.textContent.match(/^\s*/)?.[0] ?? "",
        trailingSpace: node.textContent.match(/\s*$/)?.[0] ?? "",
      });
    }

    const original = originalTextNodes.get(node);
    node.textContent = `${original.leadingSpace}${translateText(original.key, language)}${original.trailingSpace}`;
  }
}

function translateAttributes(language) {
  document.querySelectorAll("[placeholder], [aria-label], [title]").forEach((element) => {
    ["placeholder", "aria-label", "title"].forEach((attribute) => {
      if (!element.hasAttribute(attribute)) {
        return;
      }

      let attributes = originalAttributes.get(element);

      if (!attributes) {
        attributes = {};
        originalAttributes.set(element, attributes);
      }

      attributes[attribute] ??= normalizeText(element.getAttribute(attribute));
      element.setAttribute(attribute, translateText(attributes[attribute], language));
    });
  });
}

function updateLanguageButtons(language) {
  document.querySelectorAll("[data-language]").forEach((button) => {
    const isActive = button.dataset.language === language;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setLanguage(language) {
  currentLanguage = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
  saveLanguage(currentLanguage);
  document.documentElement.lang = currentLanguage;
  translateTextNodes(currentLanguage);
  translateAttributes(currentLanguage);
  updateLanguageButtons(currentLanguage);
  document.dispatchEvent(new CustomEvent(LANGUAGE_CHANGE_EVENT, { detail: { language: currentLanguage } }));
}

function initLanguageSwitcher() {
  document.querySelectorAll("[data-language]").forEach((button) => {
    button.addEventListener("click", () => {
      setLanguage(button.dataset.language);
    });
  });
}

function scrollToSection(target) {
  const header = document.querySelector(".header");
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const top = target.getBoundingClientRect().top + window.scrollY - headerHeight - 16;

  window.scrollTo({
    top: Math.max(0, top),
    behavior: "smooth",
  });
}

function initNavigation() {
  const hamburger = document.querySelector("#hamburger");
  const nav = document.querySelector(".header-nav");

  hamburger?.addEventListener("click", () => {
    nav?.classList.toggle("active-menu");
  });

  document.querySelectorAll("[data-scroll]").forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      const targetId = trigger.dataset.scroll;
      const target = targetId ? document.getElementById(targetId) : null;

      if (!target) {
        return;
      }

      event.preventDefault();
      nav?.classList.remove("active-menu");
      scrollToSection(target);
    });
  });

  document.querySelectorAll(".service-btn").forEach((button) => {
    button.addEventListener("click", (event) => {
      const contactSection = document.querySelector("#contact");
      const serviceSelect = document.querySelector("#service");

      event.preventDefault();
      if (contactSection) {
        scrollToSection(contactSection);
      }

      if (serviceSelect && button.dataset.service) {
        serviceSelect.value = button.dataset.service;
      }
    });
  });
}

function initContactForm() {
  const form = document.querySelector(".contact-form");

  if (!form) {
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  const submitLabel = submitButton?.querySelector("span") ?? submitButton;
  const successMessage = form.querySelector(".success-message");
  const errorMessage = form.querySelector(".error-message");
  const fields = Array.from(form.elements);

  let loading = false;
  let status = null;
  let statusTimer = null;

  function updateSubmitLabel() {
    if (submitLabel) {
      submitLabel.textContent = translateKey(loading ? "form.sending" : "form.send");
    }
  }

  function setLoading(isLoading) {
    loading = isLoading;
    fields.forEach((field) => {
      field.disabled = isLoading;
    });
    updateSubmitLabel();
  }

  function clearFieldErrors() {
    form.querySelectorAll(".input-error").forEach((field) => {
      field.classList.remove("input-error");
    });
  }

  function setFieldError(name, message) {
    const field = form.elements.namedItem(name);

    if (field && "classList" in field) {
      field.classList.toggle("input-error", Boolean(message));
    }
  }

  function resolveStatusMessage(nextStatus) {
    if (!nextStatus) {
      return "";
    }

    return nextStatus.key ? translateKey(nextStatus.key) : nextStatus.message;
  }

  function renderStatus() {
    const isSuccess = status?.type === "success";
    const isError = status?.type === "error";

    if (successMessage) {
      successMessage.hidden = !isSuccess;
      successMessage.textContent = isSuccess ? resolveStatusMessage(status) : "";
    }

    if (errorMessage) {
      errorMessage.hidden = !isError;
      errorMessage.textContent = isError ? resolveStatusMessage(status) : "";
    }
  }

  function clearStatus() {
    status = null;
    renderStatus();
  }

  function showStatus(nextStatus, timeout) {
    window.clearTimeout(statusTimer);
    status = nextStatus;
    renderStatus();

    if (timeout) {
      statusTimer = window.setTimeout(clearStatus, timeout);
    }
  }

  function parseError(error) {
    if (error?.errors) {
      Object.entries(error.errors).forEach(([name, messages]) => {
        const message = Array.isArray(messages) ? messages.join(", ") : String(messages);
        setFieldError(name, message);
      });

      return { type: "error", key: "form.checkErrors" };
    }

    if (error && !(error instanceof Error) && typeof error.message === "string") {
      return { type: "error", message: error.message };
    }

    return { type: "error", key: "form.sendError" };
  }

  form.querySelectorAll("input, textarea, select").forEach((field) => {
    field.addEventListener("input", () => {
      field.classList.remove("input-error");
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatus();
    clearFieldErrors();
    setLoading(true);

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: new FormData(form),
        headers: { Accept: "application/json" },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw data;
      }

      form.reset();
      showStatus({ type: "success", key: "form.sent" }, 3000);
    } catch (error) {
      showStatus(parseError(error), 2500);
    } finally {
      setLoading(false);
    }
  });

  document.addEventListener(LANGUAGE_CHANGE_EVENT, () => {
    updateSubmitLabel();
    renderStatus();
  });

  successMessage && (successMessage.hidden = true);
  errorMessage && (errorMessage.hidden = true);
  updateSubmitLabel();
}

async function initPortfolio() {
  try {
    translations = await loadTranslations();
    textTranslations = buildTextTranslations(translations);
  } catch (error) {
    console.error(error);
    textTranslations = buildTextTranslations(translations);
  }

  window.portfolioTranslate = translateKey;
  initLanguageSwitcher();
  initNavigation();
  initProtectedContacts();
  initContactForm();
  updateDynamicYears();
  updateCurrentYear();
  setLanguage(currentLanguage);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPortfolio, { once: true });
} else {
  initPortfolio();
}
