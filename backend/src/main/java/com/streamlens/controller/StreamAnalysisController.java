package com.streamlens.controller;

import com.streamlens.model.*;
import com.streamlens.service.parser.StreamParserService;
import com.streamlens.service.ir.StreamPipeline;
import com.streamlens.service.ir.StreamOperation;
import com.streamlens.service.engine.CounterfactualEngine;
import com.streamlens.service.engine.SemanticEquivalenceEngine;
import com.streamlens.service.engine.CounterexampleGenerator;
import com.streamlens.service.tracer.ExecutionTracerService;
import com.streamlens.service.benchmark.BenchmarkEngine;
import com.streamlens.service.explanation.ExplanationEngine;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api")
public class StreamAnalysisController {

    private final StreamParserService parserService;
    private final CounterfactualEngine counterfactualEngine;
    private final SemanticEquivalenceEngine equivalenceEngine;
    private final CounterexampleGenerator counterexampleGenerator;
    private final ExecutionTracerService tracerService;
    private final BenchmarkEngine benchmarkEngine;
    private final ExplanationEngine explanationEngine;

    public StreamAnalysisController(
            StreamParserService parserService,
            CounterfactualEngine counterfactualEngine,
            SemanticEquivalenceEngine equivalenceEngine,
            CounterexampleGenerator counterexampleGenerator,
            ExecutionTracerService tracerService,
            BenchmarkEngine benchmarkEngine,
            ExplanationEngine explanationEngine) {
        this.parserService = parserService;
        this.counterfactualEngine = counterfactualEngine;
        this.equivalenceEngine = equivalenceEngine;
        this.counterexampleGenerator = counterexampleGenerator;
        this.tracerService = tracerService;
        this.benchmarkEngine = benchmarkEngine;
        this.explanationEngine = explanationEngine;
    }

    @PostMapping("/analyze")
    public ResponseEntity<Map<String, Object>> analyze(@RequestBody AnalysisRequest request) {
        try {
            StreamPipeline pipeline = parserService.parse(request.getJavaCode());
            List<Integer> testInput = parseTestInput(request.getTestInput(), pipeline);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("parsedPipeline", parserService.parseToMap(request.getJavaCode()));

            Map<String, Object> trace = tracerService.traceToMap(pipeline, testInput);
            response.put("trace", trace);

            List<Map<String, Object>> alternatives = counterfactualEngine.generateAlternatives(pipeline);
            response.put("alternatives", alternatives);

            List<Map<String, Object>> analysisResults = new ArrayList<>();
            for (Map<String, Object> alt : alternatives) {
                StreamPipeline altPipeline = buildAlternativePipeline(pipeline, alt);

                SemanticEquivalenceEngine.EquivalenceResult staticResult =
                    equivalenceEngine.analyzeStatic(pipeline, altPipeline);

                Map<String, Object> analysisResult = new LinkedHashMap<>();
                analysisResult.put("originalOrder", alt.get("originalOrder"));
                analysisResult.put("alternativeOrder", alt.get("alternativeOrder"));
                analysisResult.put("operationA", alt.get("operationA"));
                analysisResult.put("operationB", alt.get("operationB"));
                analysisResult.put("classification", staticResult.classification());
                analysisResult.put("staticReason", staticResult.reason());

                if (staticResult.requiresDynamicCheck()) {
                    Map<String, Object> dynamicResult =
                        equivalenceEngine.analyzeDynamic(pipeline, altPipeline, testInput);
                    analysisResult.put("dynamicResult", dynamicResult);
                    analysisResult.put("classification", dynamicResult.get("classification"));
                    analysisResult.put("dynamicReason", dynamicResult.get("reason"));
                }

                if ("UNSAFE".equals(analysisResult.get("classification"))) {
                    Counterexample ce = counterexampleGenerator.generate(pipeline, altPipeline);
                    Map<String, Object> ceMap = new LinkedHashMap<>();
                    ceMap.put("input", ce.getInput());
                    ceMap.put("originalOutput", ce.getOriginalOutput());
                    ceMap.put("alternativeOutput", ce.getAlternativeOutput());
                    ceMap.put("explanation", ce.getExplanation());
                    analysisResult.put("counterexample", ceMap);
                }

                analysisResults.add(analysisResult);
            }
            response.put("analysisResults", analysisResults);

            if (alternatives.size() > 0 && request.isRunBenchmarks()) {
                StreamPipeline altPipeline = buildAlternativePipeline(pipeline, alternatives.get(0));
                BenchmarkResult benchResult = benchmarkEngine.benchmark(
                    pipeline, altPipeline, request.getBenchmarkIterations());
                Map<String, Object> benchMap = new LinkedHashMap<>();
                benchMap.put("originalAvg", benchResult.getOriginalAvgFormatted());
                benchMap.put("alternativeAvg", benchResult.getAlternativeAvgFormatted());
                benchMap.put("speedupRatio", benchResult.getSpeedupRatio());
                benchMap.put("iterations", benchResult.getIterations());
                response.put("benchmark", benchMap);
            }

            List<Explanation> explanations = explanationEngine.generatePipelineExplanations(pipeline);
            response.put("explanations", explanations.stream()
                .map(e -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("level", e.getLevel());
                    m.put("title", e.getTitle());
                    m.put("content", e.getContent());
                    return m;
                }).toList());

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Failed to analyze code: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/parse")
    public ResponseEntity<Map<String, Object>> parse(@RequestBody Map<String, String> request) {
        try {
            String code = request.get("javaCode");
            Map<String, Object> result = parserService.parseToMap(code);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Parse error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/trace")
    public ResponseEntity<Map<String, Object>> trace(@RequestBody Map<String, Object> request) {
        try {
            String code = (String) request.get("javaCode");
            List<Integer> input = (List<Integer>) request.get("input");

            StreamPipeline pipeline = parserService.parse(code);
            Map<String, Object> result = tracerService.traceToMap(pipeline, input);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Trace error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/counterfactual")
    public ResponseEntity<Map<String, Object>> counterfactual(@RequestBody Map<String, String> request) {
        try {
            String code = request.get("javaCode");
            StreamPipeline pipeline = parserService.parse(code);
            List<Map<String, Object>> alternatives = counterfactualEngine.generateAlternatives(pipeline);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("original", parserService.parseToMap(code));
            result.put("alternatives", alternatives);
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Counterfactual error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/equivalence")
    public ResponseEntity<Map<String, Object>> equivalence(@RequestBody Map<String, String> request) {
        try {
            String originalCode = request.get("originalCode");
            String alternativeCode = request.get("alternativeCode");

            StreamPipeline original = parserService.parse(originalCode);
            StreamPipeline alternative = parserService.parse(alternativeCode);

            SemanticEquivalenceEngine.EquivalenceResult result =
                equivalenceEngine.analyzeStatic(original, alternative);

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("classification", result.classification());
            response.put("reason", result.reason());
            response.put("requiresDynamicCheck", result.requiresDynamicCheck());

            if (result.requiresDynamicCheck()) {
                Map<String, Object> dynamicResult =
                    equivalenceEngine.analyzeDynamic(original, alternative, List.of(1, 2, 3, 4, 5));
                response.put("dynamicResult", dynamicResult);
            }

            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Equivalence check error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/counterexample")
    public ResponseEntity<Map<String, Object>> counterexample(@RequestBody Map<String, String> request) {
        try {
            String originalCode = request.get("originalCode");
            String alternativeCode = request.get("alternativeCode");

            StreamPipeline original = parserService.parse(originalCode);
            StreamPipeline alternative = parserService.parse(alternativeCode);

            Counterexample ce = counterexampleGenerator.generate(original, alternative);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("input", ce.getInput());
            result.put("originalOutput", ce.getOriginalOutput());
            result.put("alternativeOutput", ce.getAlternativeOutput());
            result.put("explanation", ce.getExplanation());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Counterexample error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/benchmark")
    public ResponseEntity<Map<String, Object>> benchmark(@RequestBody Map<String, Object> request) {
        try {
            String originalCode = (String) request.get("originalCode");
            String alternativeCode = (String) request.get("alternativeCode");
            int iterations = request.containsKey("iterations") ?
                (int) request.get("iterations") : 100;

            StreamPipeline original = parserService.parse(originalCode);
            StreamPipeline alternative = parserService.parse(alternativeCode);

            BenchmarkResult result = benchmarkEngine.benchmark(original, alternative, iterations);
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("originalAvg", result.getOriginalAvgFormatted());
            response.put("alternativeAvg", result.getAlternativeAvgFormatted());
            response.put("speedupRatio", result.getSpeedupRatio());
            response.put("iterations", result.getIterations());
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Benchmark error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @PostMapping("/explain")
    public ResponseEntity<Map<String, Object>> explain(@RequestBody Map<String, String> request) {
        try {
            String code = request.get("javaCode");
            StreamPipeline pipeline = parserService.parse(code);

            List<Explanation> explanations = explanationEngine.generatePipelineExplanations(pipeline);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("explanations", explanations.stream()
                .map(e -> {
                    Map<String, String> m = new LinkedHashMap<>();
                    m.put("level", e.getLevel());
                    m.put("title", e.getTitle());
                    m.put("content", e.getContent());
                    return m;
                }).toList());
            return ResponseEntity.ok(result);
        } catch (Exception e) {
            Map<String, Object> error = new LinkedHashMap<>();
            error.put("error", "Explanation error: " + e.getMessage());
            return ResponseEntity.badRequest().body(error);
        }
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        return ResponseEntity.ok(Map.of("status", "ok", "service", "streamlens-backend"));
    }

    private List<Integer> parseTestInput(String testInput, StreamPipeline pipeline) {
        if (testInput != null && !testInput.isEmpty()) {
            return Arrays.stream(testInput.split(","))
                .map(String::trim)
                .map(Integer::parseInt)
                .toList();
        }
        return List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30);
    }

    private StreamPipeline buildAlternativePipeline(StreamPipeline original, Map<String, Object> alternative) {
        StreamPipeline altPipeline = original.copy();
        List<String> altOrder = (List<String>) alternative.get("alternativeOrder");
        List<StreamOperation> origOps = original.getIntermediateOperations();

        List<StreamOperation> reordered = new ArrayList<>();
        for (String opName : altOrder) {
            for (StreamOperation op : origOps) {
                if (op.getType().getMethodName().equals(opName) && !reordered.contains(op)) {
                    reordered.add(op);
                    break;
                }
            }
        }

        altPipeline.setIntermediateOperations(reordered);
        return altPipeline;
    }
}
