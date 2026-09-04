package com.streamlens.model;

import java.util.List;
import java.util.Set;

public class OperationInfo {
    private int index;
    private String type;
    private String displayName;
    private String lambdaExpression;
    private String lambdaBody;
    private String inputType;
    private String outputType;
    private List<String> characteristics;
    private boolean stateful;
    private boolean shortCircuiting;
    private boolean hasSideEffects;
    private String argumentExpression;

    public int getIndex() { return index; }
    public void setIndex(int index) { this.index = index; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getLambdaExpression() { return lambdaExpression; }
    public void setLambdaExpression(String lambdaExpression) { this.lambdaExpression = lambdaExpression; }

    public String getLambdaBody() { return lambdaBody; }
    public void setLambdaBody(String lambdaBody) { this.lambdaBody = lambdaBody; }

    public String getInputType() { return inputType; }
    public void setInputType(String inputType) { this.inputType = inputType; }

    public String getOutputType() { return outputType; }
    public void setOutputType(String outputType) { this.outputType = outputType; }

    public List<String> getCharacteristics() { return characteristics; }
    public void setCharacteristics(List<String> characteristics) { this.characteristics = characteristics; }

    public boolean isStateful() { return stateful; }
    public void setStateful(boolean stateful) { this.stateful = stateful; }

    public boolean isShortCircuiting() { return shortCircuiting; }
    public void setShortCircuiting(boolean shortCircuiting) { this.shortCircuiting = shortCircuiting; }

    public boolean isHasSideEffects() { return hasSideEffects; }
    public void setHasSideEffects(boolean hasSideEffects) { this.hasSideEffects = hasSideEffects; }

    public String getArgumentExpression() { return argumentExpression; }
    public void setArgumentExpression(String argumentExpression) { this.argumentExpression = argumentExpression; }
}
