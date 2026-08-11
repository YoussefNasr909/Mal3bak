import "@testing-library/jest-dom";
import { vi } from "vitest";
import React from "react";

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // Deprecated
    removeListener: vi.fn(), // Deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock IntersectionObserver
Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: class {
    root = null;
    rootMargin = "";
    thresholds = [];
    scrollMargin = "";
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = vi.fn().mockReturnValue([]);
  } as any
});

// Mock Next.js router
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    pathname: "/",
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Mock framer-motion
vi.mock("framer-motion", async (importOriginal) => {
  const actual: any = await importOriginal();

  const omitMotionProps = ({
    initial,
    animate,
    exit,
    transition,
    whileHover,
    whileTap,
    whileInView,
    whileFocus,
    viewport,
    variants,
    layout,
    layoutId,
    ...rest
  }: any) => rest;

  const MockDiv = React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement("div", { ...omitMotionProps(props), ref }, children);
  });
  MockDiv.displayName = "motion.div";

  const MockSpan = React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement("span", { ...omitMotionProps(props), ref }, children);
  });
  MockSpan.displayName = "motion.span";

  const MockButton = React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement("button", { ...omitMotionProps(props), ref }, children);
  });
  MockButton.displayName = "motion.button";

  const MockH1 = React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement("h1", { ...omitMotionProps(props), ref }, children);
  });
  MockH1.displayName = "motion.h1";

  const MockP = React.forwardRef(({ children, ...props }: any, ref: any) => {
    return React.createElement("p", { ...omitMotionProps(props), ref }, children);
  });
  MockP.displayName = "motion.p";

  return {
    ...actual,
    motion: {
      ...actual.motion,
      div: MockDiv,
      span: MockSpan,
      button: MockButton,
      h1: MockH1,
      p: MockP,
    },
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useReducedMotion: () => false,
    useInView: () => true,
  };
});
