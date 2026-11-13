// @vitest-environment jsdom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { decorateDiffLine } from "./DiffLineContent";
import { highlightSyntaxLine } from "./syntaxHighlight";

afterEach(cleanup);

it("preserves raw source and whole-line string syntax through detail and whitespace decoration", () => {
  const source = '\treturn "Revisar cambios";  ';
  const word = source.indexOf("Revisar");
  const content = highlightSyntaxLine(source, "javascript");
  const { container } = render(<code>{decorateDiffLine(content, [
    { start: 0, end: 1 }, { start: word, end: word + 7 }, { start: source.length - 2, end: source.length },
  ])}</code>);
  // DOM/clipboard source excludes the decorative glyphs: they live in CSS.
  expect(container.textContent).toBe(source);
  expect(container.querySelector('.syntax-token--string')?.textContent).toBe('"Revisar cambios"');
  expect(container.querySelector('.syntax-token--string .diff-inline-change')?.textContent).toBe('Revisar');
  expect([...container.querySelectorAll('[data-whitespace]')].map(node => node.textContent)).toEqual(["\t", " ", " "]);
});

it("keeps search matches nested around exact changed text", () => {
  const source = ['const ', <mark key="match">value</mark>, ' = 5;'];
  const { container } = render(<code>{decorateDiffLine(source, [{ start: 6, end: 11 }])}</code>);
  expect(container.textContent).toBe('const value = 5;');
  expect(container.querySelector('mark .diff-inline-change')?.textContent).toBe('value');
});

it("marks where a fragment split across syntax tokens continues, so only its real ends are rounded", () => {
  const source = ["let ", <span key="value">value</span>, " = 1;"];
  const { container } = render(<code>{decorateDiffLine(source, [{ start: 2, end: 9 }, { start: 12, end: 13 }])}</code>);
  expect([...container.querySelectorAll(".diff-inline-change")].map(node => [node.textContent, node.className])).toEqual([
    ["t ", "diff-inline-change diff-inline-change--continues-after"],
    ["value", "diff-inline-change diff-inline-change--continues-before"],
    ["1", "diff-inline-change"],
  ]);
});

it.each(["spaces", "tabs"])("bounds decorative nodes in a long changed line of %s while preserving its source", kind => {
  const source = (kind === "tabs" ? "\t" : " ").repeat(4096);
  // Several token spans exercise the budget across the whole line, not per token.
  const tokens = [source.slice(0, 32), <span key="rest">{source.slice(32)}</span>];
  const { container } = render(<code>{decorateDiffLine(tokens, [{ start: 0, end: source.length }])}</code>);
  expect(container.textContent).toBe(source);
  expect(container.querySelectorAll("[data-whitespace]").length).toBeLessThanOrEqual(64);
  expect(container.querySelectorAll("*").length).toBeLessThan(70);
});
