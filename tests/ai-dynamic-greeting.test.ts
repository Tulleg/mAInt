import { describe, it, expect, vi } from "vitest";
import {
  determineShiftContext,
  FALLBACK_GREETING_POOL,
  getDeterministicFallbackGreeting,
  cleanGreetingText,
  generateDynamicGreeting,
  ShiftContext,
} from "@/lib/ai/greeting";
import { generateDynamicGreetingAction } from "@/actions/greeting-actions";
import { ILlmProvider } from "@/lib/ai/provider";

describe("Dynamic AI Greeting & Shift Context", () => {
  describe("determineShiftContext", () => {
    it("should correctly identify MORNING (05:00 - 10:59)", () => {
      const d1 = new Date("2026-10-23T05:00:00");
      const d2 = new Date("2026-10-23T08:30:00");
      const d3 = new Date("2026-10-23T10:59:59");

      expect(determineShiftContext(d1)).toBe("MORNING");
      expect(determineShiftContext(d2)).toBe("MORNING");
      expect(determineShiftContext(d3)).toBe("MORNING");
    });

    it("should correctly identify NOON (11:00 - 13:59)", () => {
      const d1 = new Date("2026-10-23T11:00:00");
      const d2 = new Date("2026-10-23T12:30:00");
      const d3 = new Date("2026-10-23T13:59:59");

      expect(determineShiftContext(d1)).toBe("NOON");
      expect(determineShiftContext(d2)).toBe("NOON");
      expect(determineShiftContext(d3)).toBe("NOON");
    });

    it("should correctly identify AFTERNOON (14:00 - 17:59)", () => {
      const d1 = new Date("2026-10-23T14:00:00");
      const d2 = new Date("2026-10-23T16:15:00");
      const d3 = new Date("2026-10-23T17:59:59");

      expect(determineShiftContext(d1)).toBe("AFTERNOON");
      expect(determineShiftContext(d2)).toBe("AFTERNOON");
      expect(determineShiftContext(d3)).toBe("AFTERNOON");
    });

    it("should correctly identify EVENING (18:00 - 21:59)", () => {
      const d1 = new Date("2026-10-23T18:00:00");
      const d2 = new Date("2026-10-23T20:00:00");
      const d3 = new Date("2026-10-23T21:59:59");

      expect(determineShiftContext(d1)).toBe("EVENING");
      expect(determineShiftContext(d2)).toBe("EVENING");
      expect(determineShiftContext(d3)).toBe("EVENING");
    });

    it("should correctly identify NIGHT (22:00 - 04:59)", () => {
      const d1 = new Date("2026-10-23T22:00:00");
      const d2 = new Date("2026-10-23T01:30:00");
      const d3 = new Date("2026-10-23T04:59:59");

      expect(determineShiftContext(d1)).toBe("NIGHT");
      expect(determineShiftContext(d2)).toBe("NIGHT");
      expect(determineShiftContext(d3)).toBe("NIGHT");
    });
  });

  describe("FALLBACK_GREETING_POOL", () => {
    const contexts: ShiftContext[] = ["MORNING", "NOON", "AFTERNOON", "EVENING", "NIGHT"];

    it("should provide exactly 4 fallback variants for each shiftContext", () => {
      for (const ctx of contexts) {
        const pool = FALLBACK_GREETING_POOL[ctx];
        expect(pool).toBeDefined();
        expect(pool).toHaveLength(4);
      }
    });

    it("should generate greetings with between 5 and 8 words for all variants", () => {
      for (const ctx of contexts) {
        for (let i = 0; i < 4; i++) {
          const greeting = getDeterministicFallbackGreeting(ctx, "Max", i);
          expect(greeting).toContain("Max");
          const wordCount = greeting.trim().split(/\s+/).length;
          expect(wordCount).toBeGreaterThanOrEqual(5);
          expect(wordCount).toBeLessThanOrEqual(8);
        }
      }
    });

    it("should select variants deterministically for the same firstName", () => {
      const g1 = getDeterministicFallbackGreeting("MORNING", "Anna");
      const g2 = getDeterministicFallbackGreeting("MORNING", "Anna");
      expect(g1).toBe(g2);

      const g3 = getDeterministicFallbackGreeting("MORNING", "Thorsten");
      const g4 = getDeterministicFallbackGreeting("MORNING", "Thorsten");
      expect(g3).toBe(g4);
    });
  });

  describe("cleanGreetingText", () => {
    it("should clean quotes, backticks and markdown markers", () => {
      expect(cleanGreetingText('"Guten Morgen Alex!"')).toBe("Guten Morgen Alex!");
      expect(cleanGreetingText('„Mahlzeit, die Schicht läuft!“')).toBe("Mahlzeit, die Schicht läuft!");
      expect(cleanGreetingText('**Moin Alex!**\nZweite Zeile')).toBe("Moin Alex!");
    });
  });

  describe("generateDynamicGreeting with LLM Provider", () => {
    it("should invoke ILlmProvider with low-temperature (0.7) and strict prompt", async () => {
      const mockCreateChatCompletion = vi.fn().mockResolvedValue("Moin Markus! Die Fertigungslinie 1 summt.");
      const mockProvider: ILlmProvider = {
        createChatCompletion: mockCreateChatCompletion,
        createEmbedding: vi.fn(),
        getChatModel: () => "gemini-3.8-flash",
      };

      const result = await generateDynamicGreeting(
        {
          firstName: "Markus",
          role: "Instandhalter",
          shiftContext: "MORNING",
          plantName: "Werk Regensburg",
        },
        mockProvider
      );

      expect(mockCreateChatCompletion).toHaveBeenCalledTimes(1);
      const [messages, options] = mockCreateChatCompletion.mock.calls[0];
      expect(options.temperature).toBe(0.7);
      expect(options.task).toBe("greeting");

      // Verify strict prompt
      expect(messages[0].content).toContain(
        "Du bist der humorvolle, aber professionelle KI-Assistent einer industriellen Fertigung (MaintAI)."
      );
      expect(messages[0].content).toContain(
        "Generiere eine einzige kurze Begrüßungszeile (maximal 6 bis 8 Wörter) für Markus (Instandhalter), passend zur Tageszeit MORNING."
      );
      expect(messages[0].content).toContain(
        "Antworte NUR mit dem Begrüßungssatz, keine Anführungszeichen, keine Erklärungen."
      );

      expect(result.greeting).toBe("Moin Markus! Die Fertigungslinie 1 summt.");
      expect(result.shiftContext).toBe("MORNING");
      expect(result.isFallback).toBe(false);
      expect(result.provider).toBe("gemini-3.8-flash");
    });

    it("should fall back to deterministic pool when LLM throws error", async () => {
      const mockFailingProvider: ILlmProvider = {
        createChatCompletion: vi.fn().mockRejectedValue(new Error("LLM Offline")),
        createEmbedding: vi.fn(),
      };

      const result = await generateDynamicGreeting(
        {
          firstName: "Sarah",
          role: "Schichtleiterin",
          shiftContext: "NIGHT",
        },
        mockFailingProvider
      );

      expect(result.isFallback).toBe(true);
      expect(result.shiftContext).toBe("NIGHT");
      expect(result.greeting).toContain("Sarah");
      const wordCount = result.greeting.split(/\s+/).length;
      expect(wordCount).toBeGreaterThanOrEqual(5);
      expect(wordCount).toBeLessThanOrEqual(8);
    });
  });

  describe("Server Action: generateDynamicGreetingAction", () => {
    it("should execute successfully and return formatted result", async () => {
      const res = await generateDynamicGreetingAction({
        firstName: "Klaus",
        role: "Techniker",
        shiftContext: "NOON",
        plantName: "Werk 1000",
      });

      expect(res.success).toBe(true);
      expect(res.shiftContext).toBe("NOON");
      expect(res.greeting).toBeDefined();
      expect(res.greeting.length).toBeGreaterThan(0);
      expect(res.data?.greeting).toBe(res.greeting);
    });

    it("should automatically resolve shiftContext if not passed", async () => {
      const res = await generateDynamicGreetingAction({
        firstName: "Lisa",
      });

      expect(res.success).toBe(true);
      expect(["MORNING", "NOON", "AFTERNOON", "EVENING", "NIGHT"]).toContain(res.shiftContext);
      expect(res.greeting).toContain("Lisa");
    });

    it("should handle empty firstName gracefully with fallback", async () => {
      const res = await generateDynamicGreetingAction({
        firstName: "",
      });

      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.greeting).toBeDefined();
      expect(res.isFallback).toBe(true);
    });
  });
});
