package com.streamlens.service.ir;

import java.util.ArrayList;
import java.util.List;

public class StreamPipeline {
    private String sourceType;
    private List<StreamOperation> intermediateOperations;
    private StreamOperation terminalOperation;
    private String rawSource;
    private boolean isParallel;
    private String collectionType;

    public StreamPipeline() {
        this.intermediateOperations = new ArrayList<>();
    }

    public StreamPipeline(String sourceType, List<StreamOperation> intermediateOperations, StreamOperation terminalOperation) {
        this.sourceType = sourceType;
        this.intermediateOperations = intermediateOperations;
        this.terminalOperation = terminalOperation;
    }

    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }

    public List<StreamOperation> getIntermediateOperations() { return intermediateOperations; }
    public void setIntermediateOperations(List<StreamOperation> intermediateOperations) { this.intermediateOperations = intermediateOperations; }

    public StreamOperation getTerminalOperation() { return terminalOperation; }
    public void setTerminalOperation(StreamOperation terminalOperation) { this.terminalOperation = terminalOperation; }

    public String getRawSource() { return rawSource; }
    public void setRawSource(String rawSource) { this.rawSource = rawSource; }

    public boolean isParallel() { return isParallel; }
    public void setParallel(boolean parallel) { isParallel = parallel; }

    public String getCollectionType() { return collectionType; }
    public void setCollectionType(String collectionType) { this.collectionType = collectionType; }

    public List<StreamOperation> getAllOperations() {
        List<StreamOperation> all = new ArrayList<>(intermediateOperations);
        if (terminalOperation != null) {
            all.add(terminalOperation);
        }
        return all;
    }

    public int size() {
        return getAllOperations().size();
    }

    public boolean hasStatefulOperation() {
        return intermediateOperations.stream().anyMatch(StreamOperation::isStateful);
    }

    public boolean hasShortCircuitingOperation() {
        return intermediateOperations.stream().anyMatch(StreamOperation::isShortCircuiting);
    }

    public boolean hasSideEffects() {
        return intermediateOperations.stream().anyMatch(StreamOperation::isHasSideEffects);
    }

    public StreamPipeline copy() {
        StreamPipeline copy = new StreamPipeline();
        copy.setSourceType(this.sourceType);
        copy.setRawSource(this.rawSource);
        copy.setParallel(this.isParallel);
        copy.setCollectionType(this.collectionType);
        copy.setIntermediateOperations(new ArrayList<>(this.intermediateOperations));
        copy.setTerminalOperation(this.terminalOperation);
        return copy;
    }

    public StreamPipeline withReorderedOperations(List<StreamOperation> reordered) {
        StreamPipeline copy = copy();
        copy.setIntermediateOperations(new ArrayList<>(reordered));
        return copy;
    }

    public void inferSourceType(String javaCode) {
        java.util.regex.Pattern p = java.util.regex.Pattern.compile("(\\w+(?:<[^>]+>)?)\\.stream\\(\\)");
        java.util.regex.Matcher m = p.matcher(javaCode);
        if (m.find()) {
            this.sourceType = m.group(1).replaceAll("<.*>", "").trim();
        } else {
            this.sourceType = "List";
        }
    }

    @Override
    public String toString() {
        StringBuilder sb = new StringBuilder();
        sb.append(sourceType).append(".stream()");
        for (StreamOperation op : intermediateOperations) {
            sb.append("\n    .").append(op);
        }
        if (terminalOperation != null) {
            sb.append("\n    .").append(terminalOperation);
        }
        sb.append(";");
        return sb.toString();
    }
}
