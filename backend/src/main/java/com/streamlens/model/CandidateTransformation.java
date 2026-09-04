package com.streamlens.model;

import java.util.List;

public class CandidateTransformation {
    private List<String> originalOrder;
    private List<String> alternativeOrder;
    private String description;
    private int transformationIndex;

    public List<String> getOriginalOrder() { return originalOrder; }
    public void setOriginalOrder(List<String> originalOrder) { this.originalOrder = originalOrder; }

    public List<String> getAlternativeOrder() { return alternativeOrder; }
    public void setAlternativeOrder(List<String> alternativeOrder) { this.alternativeOrder = alternativeOrder; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public int getTransformationIndex() { return transformationIndex; }
    public void setTransformationIndex(int transformationIndex) { this.transformationIndex = transformationIndex; }
}
