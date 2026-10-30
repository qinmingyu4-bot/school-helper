"use strict";
const path = require("node:path").posix;
const { DOMParser } = require("@xmldom/xmldom");

function xml(zip, name) {
  const entry = zip.getEntry(name);
  if (!entry || entry.header.size > 8 * 1024 * 1024) return null;
  const text = zip.readAsText(entry);
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null;
  try {
    return new DOMParser({ onError: (level) => { if (level !== "warning") throw new Error("Invalid XML"); } }).parseFromString(text, "application/xml");
  } catch { return null; }
}
function relationships(zip, file) {
  const doc = xml(zip, `${path.dirname(file)}/_rels/${path.basename(file)}.rels`);
  if (!doc) return [];
  return Array.from(doc.getElementsByTagNameNS("*", "Relationship")).filter((node) => node.getAttribute("TargetMode") !== "External").map((node) => ({
    id: node.getAttribute("Id"), type: node.getAttribute("Type"),
    target: path.normalize(node.getAttribute("Target").startsWith("/") ? node.getAttribute("Target").slice(1) : path.join(path.dirname(file), node.getAttribute("Target")))
  }));
}

function pptxSourceParts(zip) {
  const file = "ppt/presentation.xml", doc = xml(zip, file), rels = relationships(zip, file);
  const ids = doc ? Array.from(doc.getElementsByTagNameNS("*", "sldId")) : [];
  const ordered = ids.map((node, index) => {
    const id = Array.from(node.attributes).find((attribute) => attribute.localName === "id" && attribute.prefix)?.value;
    const relation = rels.find((item) => item.id === id && /\/slide$/.test(item.type));
    return relation && /^ppt\/slides\/[^/]+\.xml$/i.test(relation.target) && zip.getEntry(relation.target) ? { name: relation.target, number: index + 1 } : null;
  });
  // Preserve readable parts if presentation metadata is incomplete, without guessing slide order.
  const verified = ordered.length && ordered.every(Boolean) && new Set(ordered.map((part) => part.name)).size === ordered.length;
  const slides = verified ? ordered : zip.getEntries().filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true })).map((entry) => ({ name: entry.entryName }));
  const usedNotes = new Set();
  const parts = slides.flatMap((slide) => {
    const notes = relationships(zip, slide.name).filter((item) => /\/notesSlide$/.test(item.type) && /^ppt\/notesSlides\/[^/]+\.xml$/i.test(item.target) && zip.getEntry(item.target) && !usedNotes.has(item.target));
    for (const note of notes) usedNotes.add(note.target);
    return [{ name: slide.name, label: slide.number ? `Verified presentation slide ${slide.number}` : `PPTX part ${slide.name}` },
      ...notes.map((note) => ({ name: note.target, label: slide.number ? `Verified speaker notes for slide ${slide.number}` : `PPTX notes part ${note.target}` }))];
  });
  for (const entry of zip.getEntries()) if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(entry.entryName) && !usedNotes.has(entry.entryName)) parts.push({ name: entry.entryName, label: `PPTX notes part ${entry.entryName}` });
  return parts;
}

module.exports = { pptxSourceParts };
