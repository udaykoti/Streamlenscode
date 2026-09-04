package com.streamlens.model;

public class AnalysisRequest {
    private String javaCode;
    private String testInput;
    private boolean generateAlternatives;
    private boolean runBenchmarks;
    private int benchmarkIterations;

    public AnalysisRequest() {
        this.generateAlternatives = true;
        this.runBenchmarks = true;
        this.benchmarkIterations = 100;
    }

    public String getJavaCode() { return javaCode; }
    public void setJavaCode(String javaCode) { this.javaCode = javaCode; }

    public String getTestInput() { return testInput; }
    public void setTestInput(String testInput) { this.testInput = testInput; }

    public boolean isGenerateAlternatives() { return generateAlternatives; }
    public void setGenerateAlternatives(boolean generateAlternatives) { this.generateAlternatives = generateAlternatives; }

    public boolean isRunBenchmarks() { return runBenchmarks; }
    public void setRunBenchmarks(boolean runBenchmarks) { this.runBenchmarks = runBenchmarks; }

    public int getBenchmarkIterations() { return benchmarkIterations; }
    public void setBenchmarkIterations(int benchmarkIterations) { this.benchmarkIterations = benchmarkIterations; }
}
