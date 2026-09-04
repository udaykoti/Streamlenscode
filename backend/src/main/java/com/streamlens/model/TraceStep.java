package com.streamlens.model;

public class TraceStep {
    private int operationIndex;
    private String operationType;
    private Object inputValue;
    private Object outputValue;
    private boolean passed;
    private String description;

    public TraceStep() {}

    public TraceStep(int operationIndex, String operationType, Object inputValue, Object outputValue, boolean passed, String description) {
        this.operationIndex = operationIndex;
        this.operationType = operationType;
        this.inputValue = inputValue;
        this.outputValue = outputValue;
        this.passed = passed;
        this.description = description;
    }

    public int getOperationIndex() { return operationIndex; }
    public void setOperationIndex(int operationIndex) { this.operationIndex = operationIndex; }

    public String getOperationType() { return operationType; }
    public void setOperationType(String operationType) { this.operationType = operationType; }

    public Object getInputValue() { return inputValue; }
    public void setInputValue(Object inputValue) { this.inputValue = inputValue; }

    public Object getOutputValue() { return outputValue; }
    public void setOutputValue(Object outputValue) { this.outputValue = outputValue; }

    public boolean isPassed() { return passed; }
    public void setPassed(boolean passed) { this.passed = passed; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
