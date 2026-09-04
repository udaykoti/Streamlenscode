package com.streamlens.model;

public class BenchmarkResult {
    private long originalTimeNanos;
    private long alternativeTimeNanos;
    private double speedupRatio;
    private int iterations;
    private String originalAvgFormatted;
    private String alternativeAvgFormatted;
    private int originalElementCount;
    private int alternativeElementCount;

    public long getOriginalTimeNanos() { return originalTimeNanos; }
    public void setOriginalTimeNanos(long originalTimeNanos) { this.originalTimeNanos = originalTimeNanos; }

    public long getAlternativeTimeNanos() { return alternativeTimeNanos; }
    public void setAlternativeTimeNanos(long alternativeTimeNanos) { this.alternativeTimeNanos = alternativeTimeNanos; }

    public double getSpeedupRatio() { return speedupRatio; }
    public void setSpeedupRatio(double speedupRatio) { this.speedupRatio = speedupRatio; }

    public int getIterations() { return iterations; }
    public void setIterations(int iterations) { this.iterations = iterations; }

    public String getOriginalAvgFormatted() { return originalAvgFormatted; }
    public void setOriginalAvgFormatted(String originalAvgFormatted) { this.originalAvgFormatted = originalAvgFormatted; }

    public String getAlternativeAvgFormatted() { return alternativeAvgFormatted; }
    public void setAlternativeAvgFormatted(String alternativeAvgFormatted) { this.alternativeAvgFormatted = alternativeAvgFormatted; }

    public int getOriginalElementCount() { return originalElementCount; }
    public void setOriginalElementCount(int originalElementCount) { this.originalElementCount = originalElementCount; }

    public int getAlternativeElementCount() { return alternativeElementCount; }
    public void setAlternativeElementCount(int alternativeElementCount) { this.alternativeElementCount = alternativeElementCount; }
}
