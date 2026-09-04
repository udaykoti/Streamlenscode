package com.streamlens.model;

import java.util.List;

public class Counterexample {
    private List<Integer> input;
    private List<Integer> originalOutput;
    private List<Integer> alternativeOutput;
    private String explanation;
    private List<TraceStep> originalTrace;
    private List<TraceStep> alternativeTrace;

    public List<Integer> getInput() { return input; }
    public void setInput(List<Integer> input) { this.input = input; }

    public List<Integer> getOriginalOutput() { return originalOutput; }
    public void setOriginalOutput(List<Integer> originalOutput) { this.originalOutput = originalOutput; }

    public List<Integer> getAlternativeOutput() { return alternativeOutput; }
    public void setAlternativeOutput(List<Integer> alternativeOutput) { this.alternativeOutput = alternativeOutput; }

    public String getExplanation() { return explanation; }
    public void setExplanation(String explanation) { this.explanation = explanation; }

    public List<TraceStep> getOriginalTrace() { return originalTrace; }
    public void setOriginalTrace(List<TraceStep> originalTrace) { this.originalTrace = originalTrace; }

    public List<TraceStep> getAlternativeTrace() { return alternativeTrace; }
    public void setAlternativeTrace(List<TraceStep> alternativeTrace) { this.alternativeTrace = alternativeTrace; }
}
