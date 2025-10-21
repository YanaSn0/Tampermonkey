// ==UserScript==
// @name         Semantic HUD for X
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Displays a compact overlay on X media images with semantic classification (sex, race, clothing, object).
// @author       You
// @match        https://x.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// ==/UserScript==

(function() {
    'use strict';

    // --- Utility Functions ---
    function safetyColor(label) {
        return label === "safe" ? "green" : "red";
    }

    function colorFor(type, label) {
        const l = (label || "").toLowerCase();
        switch (type) {
            case "entity":
                if (["dog", "cat", "horse", "bird", "fish"].includes(l)) return "orange";
                return "dodgerblue"; // humans
            case "object":
                if (["coin", "wallet"].includes(l)) return "teal";
                if (["phone", "computer"].includes(l)) return "purple";
                return "dimgray";
            case "action":
                if (["running", "dancing", "hugging", "laughing"].includes(l)) return "mediumseagreen";
                if (["fighting", "crying"].includes(l)) return "red";
                return "gray";
            case "mood":
                if (["happy", "excited", "calm"].includes(l)) return "limegreen";
                if (["angry", "sad", "confused"].includes(l)) return "red";
                return "gray";
            case "style":
                if (["cartoon", "anime"].includes(l)) return "deeppink";
                return "silver";
            case "theme":
                if (["crypto"].includes(l)) return "darkcyan";
                if (["sports"].includes(l)) return "darkgreen";
                if (["memes"].includes(l)) return "darkmagenta";
                return "mediumpurple";
            default:
                return "gray";
        }
    }

    function makeLine(type, label, score) {
        if (!label || label === "unknown") return null;
        const line = document.createElement("div");
        const scr = typeof score === "number" ? score.toFixed(2) : "";
        line.textContent = scr ? `${label.toUpperCase()} ${scr}` : label.toUpperCase();
        line.style.background = type === "safety" ? safetyColor(label) : colorFor(type, label);
        line.style.color = "white";
        line.style.padding = "2px 6px";
        line.style.borderRadius = "4px";
        line.style.whiteSpace = "nowrap";
        line.style.textOverflow = "ellipsis";
        line.style.overflow = "hidden";
        line.style.textShadow = "0 1px 2px rgba(0,0,0,0.4)";
        return line;
    }

    function makeBadge() {
        const badge = document.createElement("div");
        badge.style.position = "absolute";
        badge.style.top = "6px";
        badge.style.left = "6px";
        badge.style.zIndex = "99999";
        badge.style.pointerEvents = "none";
        badge.style.display = "flex";
        badge.style.flexDirection = "column";
        badge.style.gap = "2px";
        badge.style.fontSize = "12px";
        badge.style.fontWeight = "bold";
        badge.style.maxWidth = "65%";
        badge.classList.add("hud-badge");
        return badge;
    }

    // --- API Configuration ---
    const API_ROOT = "http://127.0.0.1:8000/classify";
    const DEFAULT_THRESHOLD = 0.4;
    const DISPLAY_PRIORITY = ["sex", "race", "clothing", "object"];
    const MAX_SEMANTIC_LINES = 3;

    // --- Cache and Fetch ---
    const resultCache = new Map();

    async function fetchClassification(src) {
        if (resultCache.has(src)) return resultCache.get(src);
        const url = `${API_ROOT}?url=${encodeURIComponent(src)}&threshold=${DEFAULT_THRESHOLD}`;
        return new Promise((resolve) => {
            GM_xmlhttpRequest({
                method: "GET",
                url: url,
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        resultCache.set(src, data);
                        resolve(data);
                    } catch (e) {
                        console.error("HUD: Failed to parse API response:", e);
                        resolve({ error: "Failed to parse API response" });
                    }
                },
                onerror: function() {
                    console.error("HUD: Failed to fetch classification:", url);
                    resolve({ error: "Failed to classify image" });
                }
            });
        });
    }

    function wrapImageSafely(img) {
        if (img.dataset.hudWrapped === "true") return img.parentNode;
        const wrapper = document.createElement("div");
        wrapper.style.position = "relative";
        wrapper.style.display = "inline-block";
        img.parentNode.insertBefore(wrapper, img);
        wrapper.appendChild(img);
        img.dataset.hudWrapped = "true";
        return wrapper;
    }

    async function classifyAndRender(img) {
        const src = img.src || "";
        if (!src.includes("pbs.twimg.com/media")) return;

        try {
            const data = await fetchClassification(src);
            if (!data || data.error) {
                console.warn("HUD: Classification error:", data?.error || "No data");
                return;
            }

            const wrapper = wrapImageSafely(img);
            const badge = makeBadge();

            // Semantic lines
            let added = 0;
            for (const type of DISPLAY_PRIORITY) {
                const entry = data[type];
                if (!entry) continue;
                const line = makeLine(type, entry.label, entry.score);
                if (line) {
                    badge.appendChild(line);
                    added++;
                    if (added >= MAX_SEMANTIC_LINES) break;
                }
            }

            if (badge.childNodes.length === 0) return;

            const old = wrapper.querySelector(".hud-badge");
            if (old) old.remove();
            wrapper.appendChild(badge);
        } catch (e) {
            console.warn("HUD classify/render error:", e);
        }
    }

    // --- Mutation Observer for Images ---
    const observer = new MutationObserver(() => {
        document.querySelectorAll("article img").forEach(img => {
            if (img.dataset.hudReady === "true") return;
            img.dataset.hudReady = "true";
            classifyAndRender(img);
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // --- Mutation Observer for Image Source Changes ---
    const recheck = new MutationObserver(mutations => {
        for (const m of mutations) {
            if (m.type === "attributes" && m.attributeName === "src" && m.target.tagName === "IMG") {
                const img = m.target;
                const wrapper = img.parentNode;
                const badge = wrapper ? wrapper.querySelector(".hud-badge") : null;
                if (badge) badge.remove();
                resultCache.delete(m.oldValue);
                classifyAndRender(img);
            }
        }
    });

    recheck.observe(document.body, { attributes: true, attributeFilter: ["src"], subtree: true });

    // --- HUD Toggle ---
    let hudEnabled = true;
    function setHudEnabled(enabled) {
        hudEnabled = enabled;
        document.querySelectorAll(".hud-badge").forEach(b => {
            b.style.display = hudEnabled ? "flex" : "none";
        });
    }

    document.addEventListener("keydown", e => {
        if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "h") {
            setHudEnabled(!hudEnabled);
        }
    }, { passive: true });
})();
