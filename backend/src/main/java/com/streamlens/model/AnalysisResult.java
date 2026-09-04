package com.streamlens.model;

import java.util.List;
import java.util.Map;

public class AnalysisResult {
    private String classification;
    private CandidateTransformation transformation;
    private String staticReason;
    private String dynamicReason;
    private Counterexample counterexample;
    private List<Map<String, Object>> originalOutput;
    private List<Map<String, Object>> alternativeOutput;
    private boolean outputsMatch;
    private boolean orderMatch;
    private boolean countMatch;

    public String getClassification() { return classification; }
    public void setClassification(String classification) { this.classification = classification; }

    public CandidateTransformation getTransformation() { return transformation; }
    public void setTransformation(CandidateTransformation transformation) { this.transformation = transformation; }

    public String getStaticReason() { return staticReason; }
    public void setStaticReason(String staticReason) { this.staticReason = staticReason; }

    public String getDynamicReason() { return dynamicReason; }
    public void setDynamicReason(String dynamicReason) { this.dynamicReason = dynamicReason; }

    public Counterexample getCounterexample() { return counterexample; }
    public void setCounterexample(Counterexample counterexample) { this.counterexample = counterexample; }

    public List<Map<String, Object>> getOriginalOutput() { return originalOutput; }
    public void setOriginalOutput(List<Map<String, Object>> originalOutput) { this.originalOutput = originalOutput; }

    public List<Map<String, Object>> getAlternativeOutput() { return alternativeOutput; }
    public void setAlternativeOutput(List<Map<String, Object>> alternativeOutput) { this.alternativeOutput = alternativeOutput; }

    public boolean isOutputsMatch() { return outputsMatch; }
    public void setOutputsMatch(boolean outputsMatch) { this.outputsMatch = outputsMatch; }

    public boolean isOrderMatch() { return orderMatch; }
    public void setOrderMatch(boolean orderMatch) { this.orderMatch = orderMatch; }

    public boolean isCountMatch() { return countMatch; }
    public void setCountMatch(boolean countMatch) { this.countMatch = countMatch; }
}
