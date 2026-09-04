package com.streamlens.service.ir;

import java.util.Set;

public class StreamOperation {
    private int index;
    private OperationType type;
    private String lambdaExpression;
    private String lambdaBody;
    private String inputType;
    private String outputType;
    private Set<OperationCharacteristic> characteristics;
    private String rawSource;
    private boolean hasSideEffects;
    private boolean canThrowException;
    private String argumentExpression;

    public StreamOperation() {}

    public StreamOperation(OperationType type) {
        this.type = type;
        this.characteristics = OperationCharacteristic.forOperation(type);
        this.hasSideEffects = type.hasSideEffects();
    }

    public StreamOperation(OperationType type, String lambdaExpression) {
        this.type = type;
        this.lambdaExpression = lambdaExpression;
        this.characteristics = OperationCharacteristic.forOperation(type);
        this.hasSideEffects = type.hasSideEffects();
    }

    public int getIndex() { return index; }
    public void setIndex(int index) { this.index = index; }

    public OperationType getType() { return type; }
    public void setType(OperationType type) { this.type = type; }

    public String getLambdaExpression() { return lambdaExpression; }
    public void setLambdaExpression(String lambdaExpression) { this.lambdaExpression = lambdaExpression; }

    public String getLambdaBody() { return lambdaBody; }
    public void setLambdaBody(String lambdaBody) { this.lambdaBody = lambdaBody; }

    public String getInputType() { return inputType; }
    public void setInputType(String inputType) { this.inputType = inputType; }

    public String getOutputType() { return outputType; }
    public void setOutputType(String outputType) { this.outputType = outputType; }

    public Set<OperationCharacteristic> getCharacteristics() { return characteristics; }
    public void setCharacteristics(Set<OperationCharacteristic> characteristics) { this.characteristics = characteristics; }

    public String getRawSource() { return rawSource; }
    public void setRawSource(String rawSource) { this.rawSource = rawSource; }

    public boolean isHasSideEffects() { return hasSideEffects; }
    public void setHasSideEffects(boolean hasSideEffects) { this.hasSideEffects = hasSideEffects; }

    public boolean isCanThrowException() { return canThrowException; }
    public void setCanThrowException(boolean canThrowException) { this.canThrowException = canThrowException; }

    public String getArgumentExpression() { return argumentExpression; }
    public void setArgumentExpression(String argumentExpression) { this.argumentExpression = argumentExpression; }

    public boolean isStateful() {
        return characteristics.contains(OperationCharacteristic.STATEFUL);
    }

    public boolean isShortCircuiting() {
        return characteristics.contains(OperationCharacteristic.SHORT_CIRCUITING);
    }

    @Override
    public String toString() {
        if (lambdaExpression != null) {
            return type.getMethodName() + "(" + lambdaExpression + ")";
        }
        if (argumentExpression != null) {
            return type.getMethodName() + "(" + argumentExpression + ")";
        }
        return type.getMethodName() + "()";
    }
}
