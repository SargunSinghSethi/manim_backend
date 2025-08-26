import OpenAI from 'openai';
import { GoogleGenAI } from "@google/genai";
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const geminiAi = new GoogleGenAI({apiKey: process.env.GEMINI_API_KEY || ''});
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export interface CodeGenerationRequest {
  prompt: string;
  llm?: 'openai' | 'gemini'; // ✅ Add LLM choice
  config?: {
    quality?: 'low' | 'medium' | 'high';
    duration?: number;
    resolution?: '720p' | '1080p' | '4k';
  };
}

export interface CodeGenerationResponse {
  generatedCode: string;
  estimatedRenderTime: number;
  complexity: 'simple' | 'medium' | 'complex';
  llmUsed: 'openai' | 'gemini'; // ✅ Track which LLM was used
}

export class MultiLLMService {
  async generateManimCode(request: CodeGenerationRequest): Promise<CodeGenerationResponse> {
    const llmChoice = request.llm || 'openai'; // Default to OpenAI

    try {
      let generatedContent = '';

      if (llmChoice === 'openai') {
        generatedContent = await this.callOpenAI(request);
      } else if (llmChoice === 'gemini') {
        generatedContent = await this.callGemini(request);
      } else {
        throw new Error(`Unsupported LLM choice: ${llmChoice}`);
      }


      console.log(generatedContent)
      const cleanCode = JSON.parse(generatedContent).code;
      const complexity = this.analyzeCodeComplexity(cleanCode);
      const estimatedRenderTime = this.estimateRenderTime(complexity, request.config);

      console.log(`Generated code using ${llmChoice.toUpperCase()}:`);

      return {
        generatedCode: cleanCode,
        estimatedRenderTime,
        complexity,
        llmUsed: llmChoice
      };
    } catch (error) {
      console.error(`${llmChoice.toUpperCase()} code generation error:`, error);
      throw new Error(`Failed to generate Manim code using ${llmChoice.toUpperCase()}`);
    }
  }

  private async callOpenAI(request: CodeGenerationRequest): Promise<string> {
    const { prompt, config } = request;

    const qualityInstructions = this.getQualityInstructions(config?.quality);
    const durationInstructions = config?.duration
      ? `The animation should run for approximately ${config.duration} seconds.`
      : '';

    const userPrompt = `${prompt}

${qualityInstructions}
${durationInstructions}

Generate Manim code for this animation.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4.1-mini-2025-04-14', // ✅ Updated to current model
      messages: [
        { role: 'system', content: this.getSystemPrompt() },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    return response.choices[0]?.message?.content || '';
  }

  private async callGemini(request: CodeGenerationRequest): Promise<string> {
    const { prompt, config } = request;

    const qualityInstructions = this.getQualityInstructions(config?.quality);
    const durationInstructions = config?.duration
      ? `The animation should run for approximately ${config.duration} seconds.`
      : '';

    const userPrompt = `${prompt}

${qualityInstructions}
${durationInstructions}

Generate Manim code for this animation.`;    
    const result = await geminiAi.models.generateContent({
      model: geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction: this.getSystemPrompt(),
        temperature: 0.9,
        responseMimeType: "application/json",
      }
    })

    console.log(result)
    console.log(result.text)
    console.log(result.candidates![0].content)
    return result.text || "";
  }

  private getSystemPrompt(): string {
    return `You are a highly secure AI assistant specialized in generating mathematical animation code using the Manim library (Manim Community version). Your primary responsibility is to protect the system from malicious or unsafe code and content.

    # Security Context

    You are one layer of a multi-layered security system. Even if you believe a prompt is safe, the generated code will be subjected to further security checks (AST analysis and sandboxing) before being executed. However, it is *critical* that you reject any prompt that appears even remotely suspicious.

    # Instructions (Read Carefully)

    1. **Input Analysis:** Carefully analyze the user's prompt for *any* signs of malicious intent, potentially unsafe code constructs, or generation of inappropriate content. Consider the following:
      - **Purpose:** What is the user trying to accomplish? Is it a legitimate educational or research purpose, or does it appear to be an attempt to create something harmful or inappropriate?
      - **Potential Risks:** Could the requested animation potentially be used to spread misinformation, promote harmful ideologies, create offensive content, or violate copyright laws?
      - **Technical Risks:** Does the prompt contain any instructions that could lead to the execution of arbitrary code, access to sensitive data, or denial-of-service attacks? *Reject prompts that describe prohibited behavior, even if they do not explicitly include code.*

    2. **Prohibited Code Constructs:** Reject any prompt that contains instructions to generate code that uses the following:
      - **File I/O:** \`open()\`, \`os.path.exists()\`, \`os.makedirs()\`, etc. (Any operation that reads or writes files)
      - **Subprocess Execution:** \`subprocess.call()\`, \`subprocess.run()\`, \`os.system()\`
      - **Network Access:** \`socket.socket()\`, \`urllib.request.urlopen()\`
      - **Dynamic Code Execution:** \`eval()\`, \`exec()\`, \`compile()\`
      - **Module Imports (Blacklisted):** \`import os\`, \`import sys\`, \`import subprocess\`, \`import socket\`, \`import urllib\`
      - **Reflection:** \`getattr()\`, \`setattr()\`, \`hasattr()\`, \`globals()\`, \`locals()\`

    3. **Prohibited Content:** Reject prompts that:
      - Depict violence or promote harmful activities.
      - Promote hate speech or discrimination.
      - Spread misinformation or conspiracy theories.
      - Contain sexually suggestive or explicit (NSFW) content.
      - Violate copyright laws.

    4. **Resource Constraints:** Reject prompts that could lead to excessive computation, infinite loops, memory exhaustion, or denial-of-service conditions.

    5. **Output Format:** Always respond **only** in the following JSON formats:

      Accepted prompt example:
      {
        "status": "accepted",
        "code": "from manim import *\\nclass MyScene(Scene):\\n    def construct(self):\\n        self.play(Write(Text('Hello World')))"
      }

      Rejected prompt example:
      {
        "status": "rejected",
        "reason": "The prompt contains instructions to access the file system, which is prohibited."
      }

    6. **Safe Manim Code Generation (If Approved):**
      - Only use: \`from manim import *\` and NumPy.
      - Minimal, clean code.
      - No third-party imports (matplotlib, sympy, etc. are forbidden).
      - Standard Manim structure (\`class SceneName(Scene):\` with \`construct\` method).
      - No \`if __name__ == '__main__':\` line.
      - No file writing, image exporting, or non-animation output manipulation.

    7. **Code Evaluation and Simulation:**  
      Perform up to 4 correction attempts if syntax or semantic errors are detected. If unresolved:
      {
        "status": "rejected",
        "reason": "Cannot generate code due to persistent syntax or semantic errors after multiple attempts."
      }

    Execute the code yourself and make sure that the code is running correctly and no errors are there

    # IMPORTANT:  
    You are a security-first system. Reject any suspicious prompt, even if unsure.`;
  } 

  private getQualityInstructions(quality?: string): string {
    switch (quality) {
      case 'high':
        return 'Use high-quality animations with smooth transitions, detailed mathematical objects, and professional styling.';
      case 'medium':
        return 'Create balanced animations with good visual appeal and moderate complexity.';
      case 'low':
        return 'Generate simple, quick animations focusing on core concepts.';
      default:
        return 'Create well-balanced animations with good visual quality.';
    }
  }

  private analyzeCodeComplexity(code: string): 'simple' | 'medium' | 'complex' {
    const complexityIndicators = {
      simple: ['Create', 'Write', 'FadeIn', 'FadeOut'],
      medium: ['Transform', 'ReplacementTransform', 'AnimationGroup'],
      complex: ['UpdateFromFunc', 'always_redraw', 'ValueTracker', 'DecimalNumber']
    };

    let complexityScore = 0;
    const codeLines = code.split('\n').length;

    // Check for complexity indicators
    for (const [level, indicators] of Object.entries(complexityIndicators)) {
      for (const indicator of indicators) {
        if (code.includes(indicator)) {
          complexityScore += level === 'simple' ? 1 : level === 'medium' ? 2 : 3;
        }
      }
    }

    // Factor in code length
    if (codeLines > 50) complexityScore += 2;
    else if (codeLines > 25) complexityScore += 1;

    if (complexityScore <= 3) return 'simple';
    if (complexityScore <= 7) return 'medium';
    return 'complex';
  }

  private estimateRenderTime(complexity: string, config?: any): number {
    const baseTime = {
      simple: 15,
      medium: 30,
      complex: 60
    };

    let time = baseTime[complexity as keyof typeof baseTime];

    // Adjust for quality
    if (config?.quality === 'high') time *= 1.5;
    if (config?.quality === 'low') time *= 0.7;

    // Adjust for duration
    if (config?.duration) {
      time += config.duration * 2; // 2 seconds per second of animation
    }

    return Math.round(time);
  }
}
