import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { ForgotPasswordContent } from "@/components/auth/forgot-password-content";
import { ResetPasswordContent } from "@/components/auth/reset-password-content";
import * as authProvider from "@/components/providers/auth-provider";
import * as languageProvider from "@/components/providers/language-provider";
import * as api from "@/lib/api";

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
}));

const searchParamsState = vi.hoisted(() => ({
  current: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/auth/login",
  useSearchParams: () => searchParamsState.current,
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("@/components/auth/auth-navbar", () => ({
  AuthNavbar: () => <div data-testid="auth-navbar" />,
}));

vi.mock("@/components/ui/floating-elements", () => ({
  GridBackground: () => <div data-testid="grid-background" />,
}));

vi.mock("@/components/ui/animated-container", () => ({
  AnimatedContainer: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    authForgotPassword: vi.fn(),
    authResetPassword: vi.fn(),
  };
});

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      {children}
    </ThemeProvider>
  );
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Auth forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParamsState.current = new URLSearchParams();
    window.location.hash = "";

    (languageProvider.useLanguage as any).mockReturnValue({
      language: "en",
      direction: "ltr",
      t: (key: string) => {
        const translations: Record<string, string> = {
          "validation.emailInvalid": "Invalid email address",
          "validation.passwordMin": "Password must be at least 6 characters",
          "auth.name": "Name",
          "auth.email": "Email",
          "auth.phone": "Phone",
          "auth.password": "Password",
          "auth.confirmPassword": "Confirm Password",
        };
        return translations[key] || key;
      },
    });

    (authProvider.useAuth as any).mockReturnValue({
      login: vi.fn().mockResolvedValue(undefined),
      register: vi.fn().mockResolvedValue(undefined),
      isLoading: false,
      user: null,
    });

    (api.authForgotPassword as any).mockResolvedValue({ ok: true });
    (api.authResetPassword as any).mockResolvedValue({ ok: true });
  });

  describe("LoginForm", () => {
    it("normalizes the email and submits credentials with remember me disabled by default", async () => {
      const login = vi.fn().mockResolvedValue(undefined);
      (authProvider.useAuth as any).mockReturnValue({
        login,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "  PLAYER@Example.com  " },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Sign In$/i }));

      await waitFor(() => {
        expect(login).toHaveBeenCalledWith("player@example.com", "Password123", false);
      });
      expect(mockToast.success).toHaveBeenCalledWith("Login successful");
    });

    it("shows an inline error for invalid credentials", async () => {
      const login = vi
        .fn()
        .mockRejectedValue(new api.ApiError("Incorrect email or password", 401));
      (authProvider.useAuth as any).mockReturnValue({
        login,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "player@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Sign In$/i }));

      expect(await screen.findByText("Incorrect email or password")).toBeInTheDocument();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("shows a specific inline error for inactive accounts", async () => {
      const login = vi
        .fn()
        .mockRejectedValue(new api.ApiError("Account is inactive", 403));
      (authProvider.useAuth as any).mockReturnValue({
        login,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "player@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Sign In$/i }));

      expect(await screen.findByText("Your account is inactive. Please contact support or the administrator.")).toBeInTheDocument();
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it("validates empty login fields before submitting", async () => {
      const login = vi.fn();
      (authProvider.useAuth as any).mockReturnValue({
        login,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      fireEvent.click(screen.getByRole("button", { name: /^Sign In$/i }));

      expect(await screen.findByText("Invalid email address")).toBeInTheDocument();
      expect(screen.getByText("Enter your password")).toBeInTheDocument();
      expect(login).not.toHaveBeenCalled();
    });

    it("shows an inline error when login fails because of a network issue", async () => {
      const login = vi.fn().mockRejectedValue(new api.NetworkError("Connection lost"));
      (authProvider.useAuth as any).mockReturnValue({
        login,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "player@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /^Sign In$/i }));

      expect(
        await screen.findByText("We couldn't reach the server. Check your connection and try again."),
      ).toBeInTheDocument();
      expect(mockToast.error).toHaveBeenCalledWith("We couldn't reach the server. Check your connection and try again.");
    });

    it("disables the login submit button while a request is in flight to prevent double submit", async () => {
      const deferred = createDeferred<void>();
      const login = vi.fn().mockReturnValue(deferred.promise);
      (authProvider.useAuth as any).mockReturnValue({
        login,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "player@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });

      const button = screen.getByRole("button", { name: /^Sign In$/i });
      fireEvent.click(button);
      fireEvent.click(button);

      await waitFor(() => {
        expect(login).toHaveBeenCalledTimes(1);
        expect(button).toBeDisabled();
      });

      deferred.resolve(undefined);
      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith("Login successful");
      });
    });

    it("keeps the submit button enabled during background auth hydration", () => {
      (authProvider.useAuth as any).mockReturnValue({
        login: vi.fn(),
        isLoading: true,
        user: null,
      });

      render(
        <TestWrapper>
          <LoginForm />
        </TestWrapper>,
      );

      expect(screen.getByRole("button", { name: /^Sign In$/i })).toBeEnabled();
    });

    it("renders a non-submitting login button before hydration", () => {
      const html = renderToStaticMarkup(<LoginForm />);
      expect(html).toMatch(/type="button"/);
      expect(html).toMatch(/disabled/);
    });
  });

  describe("RegisterForm", () => {

    it("shows a visible error when registration fails because of a network issue", async () => {
      const register = vi.fn().mockRejectedValue(new api.NetworkError("Connection lost"));
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
        user: null,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Fresh User" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "fresh@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password123" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      expect(await screen.findByText("We couldn't reach the server. Check your connection and try again.")).toBeInTheDocument();
      expect(mockToast.error).toHaveBeenCalledWith("We couldn't reach the server. Check your connection and try again.");
    });



    it("normalizes the name, email, and phone before submit", async () => {
      const register = vi.fn().mockResolvedValue(undefined);
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "  Omar Ali  " },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "  OMAR@example.com  " },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "+20 101-234-5678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      await waitFor(() => {
        expect(register).toHaveBeenCalledWith({
          name: "Omar Ali",
          email: "omar@example.com",
          phone: "201012345678",
          password: "Password123",
        });
      });
    });

    it("maps duplicate phone conflicts to the phone field", async () => {
      const register = vi
        .fn()
        .mockRejectedValue(new api.ApiError("Phone already exists", 409));
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Omar Ali" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "omar@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      expect(await screen.findByText("Phone number already in use")).toBeInTheDocument();
      expect(mockToast.error).toHaveBeenCalledWith("Phone number already in use");
    });

    it("maps duplicate email conflicts to the email field", async () => {
      const register = vi
        .fn()
        .mockRejectedValue(new api.ApiError("Email already exists", 409));
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Omar Ali" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "omar@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      expect(await screen.findByText("Email already in use")).toBeInTheDocument();
      expect(mockToast.error).toHaveBeenCalledWith("Email already in use");
    });

    it("shows an inline error when registration fails because the server is unreachable", async () => {
      const register = vi.fn().mockRejectedValue(new api.NetworkError("Connection lost"));
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Omar Ali" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "omar@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      expect(
        await screen.findByText("We couldn't reach the server. Check your connection and try again."),
      ).toBeInTheDocument();
      expect(mockToast.error).toHaveBeenCalledWith("We couldn't reach the server. Check your connection and try again.");
    });

    it("validates password mismatch before registration", async () => {
      const register = vi.fn();
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Omar Ali" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "omar@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password124" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      expect(await screen.findByText("Passwords do not match")).toBeInTheDocument();
      expect(register).not.toHaveBeenCalled();
    });

    it("validates weak passwords before registration", async () => {
      const register = vi.fn();
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Omar Ali" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "omar@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "short" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "short" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Create Account/i }));

      expect(await screen.findByText("Password must be at least 8 characters")).toBeInTheDocument();
      expect(register).not.toHaveBeenCalled();
    });

    it("disables the register submit button while a request is in flight", async () => {
      const deferred = createDeferred<void>();
      const register = vi.fn().mockReturnValue(deferred.promise);
      (authProvider.useAuth as any).mockReturnValue({
        register,
        isLoading: false,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Full Name"), {
        target: { value: "Omar Ali" },
      });
      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "omar@example.com" },
      });
      fireEvent.change(screen.getByPlaceholderText("Phone Number"), {
        target: { value: "01012345678" },
      });
      fireEvent.change(screen.getByPlaceholderText("Password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Confirm Password"), {
        target: { value: "Password123" },
      });

      const button = screen.getByRole("button", { name: /Create Account/i });
      fireEvent.click(button);
      fireEvent.click(button);

      await waitFor(() => {
        expect(register).toHaveBeenCalledTimes(1);
        expect(button).toBeDisabled();
      });

      deferred.resolve(undefined);
      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith("Account created and signed in successfully");
      });
    });

    it("keeps the register submit button enabled during background auth hydration", () => {
      (authProvider.useAuth as any).mockReturnValue({
        register: vi.fn(),
        isLoading: true,
      });

      render(
        <TestWrapper>
          <RegisterForm />
        </TestWrapper>,
      );

      expect(screen.getByRole("button", { name: /Create Account/i })).toBeEnabled();
    });

    it("renders a non-submitting register button before hydration", () => {
      const html = renderToStaticMarkup(<RegisterForm />);
      expect(html).toMatch(/type="button"/);
      expect(html).toMatch(/disabled/);
    });
  });

  describe("ForgotPasswordContent", () => {
    it("normalizes the email, supports resend, and restores the form", async () => {
      render(
        <TestWrapper>
          <ForgotPasswordContent />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Email"), {
        target: { value: "  PLAYER@Example.com " },
      });
      fireEvent.click(screen.getByRole("button", { name: /Send reset link/i }));

      await waitFor(() => {
        expect(api.authForgotPassword).toHaveBeenCalledWith({
          email: "player@example.com",
        });
      });

      expect(await screen.findByText("player@example.com")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Resend link/i }));

      await waitFor(() => {
        expect(api.authForgotPassword).toHaveBeenNthCalledWith(2, {
          email: "player@example.com",
        });
      });

      fireEvent.click(screen.getByRole("button", { name: /Use another email/i }));

      const emailInput = await screen.findByPlaceholderText("Email");
      expect(emailInput).toHaveValue("player@example.com");
    });
  });

  describe("ResetPasswordContent", () => {
    it("shows the invalid-link state when uid or token is missing", async () => {
      searchParamsState.current = new URLSearchParams();

      render(
        <TestWrapper>
          <ResetPasswordContent />
        </TestWrapper>,
      );

      expect(screen.getByText("The link is invalid or has expired.")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Request a new link/i })).toHaveAttribute(
        "href",
        "/auth/forgot-password",
      );
    });

    it("submits a new password and returns the user to login", async () => {
      searchParamsState.current = new URLSearchParams("uid=user-123&token=token-xyz");

      render(
        <TestWrapper>
          <ResetPasswordContent />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Enter new password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Re-enter password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Update password/i }));

      await waitFor(() => {
        expect(api.authResetPassword).toHaveBeenCalledWith({
          userId: "user-123",
          token: "token-xyz",
          newPassword: "Password123",
        });
      });

      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith("/auth/login");
      });
    });

    it("accepts reset links where the token is stored in the URL hash", async () => {
      window.location.hash = "#uid=user-456&token=hash-token"

      render(
        <TestWrapper>
          <ResetPasswordContent />
        </TestWrapper>,
      );

      fireEvent.change(screen.getByPlaceholderText("Enter new password"), {
        target: { value: "Password123" },
      });
      fireEvent.change(screen.getByPlaceholderText("Re-enter password"), {
        target: { value: "Password123" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Update password/i }));

      await waitFor(() => {
        expect(api.authResetPassword).toHaveBeenCalledWith({
          userId: "user-456",
          token: "hash-token",
          newPassword: "Password123",
        });
      });
    });
  });
});
