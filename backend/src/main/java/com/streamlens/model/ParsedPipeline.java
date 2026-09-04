package com.streamlens.model;

import java.util.List;

public class ParsedPipeline {
    private String sourceType;
    private List<OperationInfo> operations;
    private OperationInfo terminalOperation;
    private boolean isParallel;
    private String rawSource;

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }

    public List<OperationInfo> getOperations() { return operations; }
    public void setOperations(List<OperationInfo> operations) { this.operations = operations; }

    public OperationInfo getTerminalOperation() { return terminalOperation; }
    public void setTerminalOperation(OperationInfo terminalOperation) { this.terminalOperation = terminalOperation; }

    public boolean isParallel() { return isParallel; }
    public void setParallel(boolean parallel) { isParallel = parallel; }

    public String getRawSource() { return rawSource; }
    public void setRawSource(String rawSource) { this.rawSource = rawSource; }
}
