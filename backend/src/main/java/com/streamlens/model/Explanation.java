package com.streamlens.model;

public class Explanation {
    private String level;
    private String title;
    private String content;

    public Explanation() {}

    public Explanation(String level, String title, String content) {
        this.level = level;
        this.title = title;
        this.content = content;
    }

    public String getLevel() { return level; }
    public void setLevel(String level) { this.level = level; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
}
