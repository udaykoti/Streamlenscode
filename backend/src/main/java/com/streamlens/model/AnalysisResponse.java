package com.streamlens.model;

import java.util.List;

public class AnalysisResponse {
    private ParsedPipeline parsedPipeline;
    private List<TraceResult> traces;
    private List<CandidateTransformation> alternatives;
    private List<AnalysisResult> analysisResults;
    private BenchmarkResult benchmark;
    private List<Explanation> explanations;
    private String error;

    public ParsedPipeline getParsedPipeline() { return parsedPipeline; }
    public void setParsedPipeline(ParsedPipeline parsedPipeline) { this.parsedPipeline = parsedPipeline; }

    public List<TraceResult> getTraces() { return traces; }
    public void setTraces(List<TraceResult> traces) { this.traces = traces; }

    public List<CandidateTransformation> getAlternatives() { return alternatives; }
    public void setAlternatives(List<CandidateTransformation> alternatives) { this.alternatives = alternatives; }

    public List<AnalysisResult> getAnalysisResults() { return analysisResults; }
    public void setAnalysisResults(List<AnalysisResult> analysisResults) { this.analysisResults = analysisResults; }

    public BenchmarkResult getBenchmark() { return benchmark; }
    public void setBenchmark(BenchmarkResult benchmark) { this.benchmark = benchmark; }

    public List<Explanation> getExplanations() { return explanations; }
    public void setExplanations(List<Explanation> explanations) { this.explanations = explanations; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
