import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock actions
vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

// Mock anon-work-tracker
vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

const mockSignInAction = vi.mocked(signInAction);
const mockSignUpAction = vi.mocked(signUpAction);
const mockGetProjects = vi.mocked(getProjects);
const mockCreateProject = vi.mocked(createProject);
const mockGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockClearAnonWork = vi.mocked(clearAnonWork);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAnonWorkData.mockReturnValue(null);
});

describe("useAuth", () => {
  describe("initial state", () => {
    it("returns isLoading as false initially", () => {
      const { result } = renderHook(() => useAuth());
      expect(result.current.isLoading).toBe(false);
    });

    it("exposes signIn, signUp, and isLoading", () => {
      const { result } = renderHook(() => useAuth());
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
      expect(typeof result.current.isLoading).toBe("boolean");
    });
  });

  describe("signIn", () => {
    describe("happy path", () => {
      it("calls signInAction with email and password", async () => {
        mockSignInAction.mockResolvedValue({ success: false, error: "Invalid credentials" });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "password123");
        });

        expect(mockSignInAction).toHaveBeenCalledWith("user@example.com", "password123");
      });

      it("sets isLoading true during sign in and false after", async () => {
        let resolveSignIn!: (val: any) => void;
        const pendingPromise = new Promise((res) => { resolveSignIn = res; });
        mockSignInAction.mockReturnValue(pendingPromise as any);

        const { result } = renderHook(() => useAuth());

        act(() => {
          result.current.signIn("user@example.com", "pass");
        });
        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          resolveSignIn({ success: false, error: "fail" });
          await pendingPromise;
        });
        expect(result.current.isLoading).toBe(false);
      });

      it("returns the result from signInAction", async () => {
        const mockResult = { success: false, error: "Invalid credentials" };
        mockSignInAction.mockResolvedValue(mockResult);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;
        await act(async () => {
          returnValue = await result.current.signIn("user@example.com", "pass");
        });

        expect(returnValue).toEqual(mockResult);
      });

      it("redirects to existing project after successful sign in", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([{ id: "proj-123" } as any]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/proj-123");
      });

      it("creates a new project and redirects when no existing projects", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([]);
        mockCreateProject.mockResolvedValue({ id: "new-proj-456" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({ messages: [], data: {} })
        );
        expect(mockPush).toHaveBeenCalledWith("/new-proj-456");
      });

      it("saves anonymous work and redirects when anon work exists", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "hello" }],
          fileSystemData: { "/App.jsx": { content: "..." } },
        };
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(anonWork);
        mockCreateProject.mockResolvedValue({ id: "anon-proj-789" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonWork.messages,
            data: anonWork.fileSystemData,
          })
        );
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/anon-proj-789");
        expect(mockGetProjects).not.toHaveBeenCalled();
      });
    });

    describe("error states", () => {
      it("does not redirect when sign in fails", async () => {
        mockSignInAction.mockResolvedValue({ success: false, error: "Wrong password" });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "wrongpass");
        });

        expect(mockPush).not.toHaveBeenCalled();
        expect(mockGetProjects).not.toHaveBeenCalled();
        expect(mockCreateProject).not.toHaveBeenCalled();
      });

      it("sets isLoading to false even if signInAction throws", async () => {
        mockSignInAction.mockRejectedValue(new Error("Network error"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          try {
            await result.current.signIn("user@example.com", "pass");
          } catch {
            // expected
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("skips anon work when messages array is empty", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue({ messages: [], fileSystemData: {} });
        mockGetProjects.mockResolvedValue([{ id: "proj-1" } as any]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockGetProjects).toHaveBeenCalled();
        expect(mockClearAnonWork).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/proj-1");
      });

      it("redirects to most recent (first) project when multiple exist", async () => {
        mockSignInAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([
          { id: "recent-proj" } as any,
          { id: "older-proj" } as any,
        ]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signIn("user@example.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/recent-proj");
        expect(mockCreateProject).not.toHaveBeenCalled();
      });
    });
  });

  describe("signUp", () => {
    describe("happy path", () => {
      it("calls signUpAction with email and password", async () => {
        mockSignUpAction.mockResolvedValue({ success: false, error: "Email taken" });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "password123");
        });

        expect(mockSignUpAction).toHaveBeenCalledWith("new@example.com", "password123");
      });

      it("sets isLoading true during sign up and false after", async () => {
        let resolveSignUp!: (val: any) => void;
        const pendingPromise = new Promise((res) => { resolveSignUp = res; });
        mockSignUpAction.mockReturnValue(pendingPromise as any);

        const { result } = renderHook(() => useAuth());

        act(() => {
          result.current.signUp("new@example.com", "pass");
        });
        expect(result.current.isLoading).toBe(true);

        await act(async () => {
          resolveSignUp({ success: false, error: "fail" });
          await pendingPromise;
        });
        expect(result.current.isLoading).toBe(false);
      });

      it("returns the result from signUpAction", async () => {
        const mockResult = { success: false, error: "Email already in use" };
        mockSignUpAction.mockResolvedValue(mockResult);

        const { result } = renderHook(() => useAuth());
        let returnValue: any;
        await act(async () => {
          returnValue = await result.current.signUp("new@example.com", "pass");
        });

        expect(returnValue).toEqual(mockResult);
      });

      it("runs handlePostSignIn after successful sign up", async () => {
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(null);
        mockGetProjects.mockResolvedValue([{ id: "proj-abc" } as any]);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "pass");
        });

        expect(mockPush).toHaveBeenCalledWith("/proj-abc");
      });

      it("saves anonymous work after successful sign up", async () => {
        const anonWork = {
          messages: [{ role: "user", content: "build me a button" }],
          fileSystemData: { "/App.jsx": {} },
        };
        mockSignUpAction.mockResolvedValue({ success: true });
        mockGetAnonWorkData.mockReturnValue(anonWork);
        mockCreateProject.mockResolvedValue({ id: "saved-proj" } as any);

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("new@example.com", "pass");
        });

        expect(mockCreateProject).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: anonWork.messages,
            data: anonWork.fileSystemData,
          })
        );
        expect(mockClearAnonWork).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith("/saved-proj");
      });
    });

    describe("error states", () => {
      it("does not redirect when sign up fails", async () => {
        mockSignUpAction.mockResolvedValue({ success: false, error: "Email taken" });

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          await result.current.signUp("existing@example.com", "pass");
        });

        expect(mockPush).not.toHaveBeenCalled();
      });

      it("sets isLoading to false even if signUpAction throws", async () => {
        mockSignUpAction.mockRejectedValue(new Error("Server error"));

        const { result } = renderHook(() => useAuth());
        await act(async () => {
          try {
            await result.current.signUp("new@example.com", "pass");
          } catch {
            // expected
          }
        });

        expect(result.current.isLoading).toBe(false);
      });
    });
  });
});
