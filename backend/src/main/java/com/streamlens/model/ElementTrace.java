package com.streamlens.model;

import java.util.List;

public class ElementTrace {
    private Object inputValue;
    private List<TraceStep> steps;
    private Object outputValue;
    private boolean accepted;

    public Object getInputValue() { return inputValue; }
    public void setInputValue(Object inputValue) { this.inputValue = inputValue; }

    public List<TraceStep> getSteps() { return steps; }
    public void setSteps(List<TraceStep> steps) { this.steps = steps; }

    public Object getOutputValue() { return outputValue; }
    public void setOutputValue(Object outputValue) { this.outputValue = outputValue; }

    public boolean isAccepted() { return accepted; }
    public void setAccepted(boolean accepted) { this.accepted = accepted; }
}
