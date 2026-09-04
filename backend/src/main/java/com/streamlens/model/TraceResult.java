package com.streamlens.model;

import java.util.List;

public class TraceResult {
    private List<ElementTrace> elementTraces;
    private String pipelineDescription;

    public List<ElementTrace> getElementTraces() { return elementTraces; }
    public void setElementTraces(List<ElementTrace> elementTraces) { this.elementTraces = elementTraces; }

    public String getPipelineDescription() { return pipelineDescription; }
    public void setPipelineDescription(String pipelineDescription) { this.pipelineDescription = pipelineDescription; }
}
