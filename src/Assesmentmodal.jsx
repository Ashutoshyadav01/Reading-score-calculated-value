import React, { useState, useRef } from "react";
import AudioPlayer from "react-h5-audio-player";
import "react-h5-audio-player/lib/styles.css";
import { CircularProgress, Button, Modal, Box } from "@mui/material";

const modalStyle = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: "90%",
  maxWidth: 700,
  bgcolor: "#fdfdfd",
  boxShadow: 24,
  borderRadius: 6,
  p: 0,
  maxHeight: "90vh",
  overflowY: "auto",
  fontFamily: "'Segoe UI', sans-serif",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
  "&::-webkit-scrollbar": {
    display: "none",
  },
};

const headerStyle = {
  background: "linear-gradient(90deg, #1976d2, #42a5f5)",
  color: "#fff",
  padding: "16px 24px",
  fontSize: "20px",
  fontWeight: "bold",
  borderTopLeftRadius: 6,
  borderTopRightRadius: 6,
};

const bodyStyle = { padding: "24px" };
const paragraphStyle = { fontSize: "15px", margin: "8px 0", color: "#333" };

const AssessmentModal = ({ open, onClose, data }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const audioRef = useRef(null);

  const items = [
    {
      type: "Average",
      title: "👋 Hello",
      text: "Welcome to your reading assessment!"
    },
    ...Object.keys(data)
      .filter((key) => !isNaN(Number(key)))
      .map((key) => data[key])
  ];
  const allScores = items?.map(item => ({
    accuracy: item?.azureResult?.pronunciationScores?.accuracy || 0,
    fluency: item?.azureResult?.pronunciationScores?.fluency || 0,
    completeness: item?.azureResult?.pronunciationScores?.completeness || 0,
    overall: item?.azureResult?.pronunciationScores?.overall || 0
  }));

  // number of pages
  const count = allScores?.length - 1 || 1;

  // sum everything
  const totals = allScores?.reduce(
    (acc, score) => {
      acc.accuracy += score.accuracy;
      acc.fluency += score.fluency;
      acc.completeness += score.completeness;
      acc.overall += score.overall;
      return acc;
    },
    { accuracy: 0, fluency: 0, completeness: 0, overall: 0 }
  );

  // calculate averages
  const averages = {
    accuracy: (totals.accuracy / count).toFixed(2),
    fluency: (totals.fluency / count).toFixed(2),
    completeness: (totals.completeness / count).toFixed(2),
    overall: (totals.overall / count).toFixed(2)
  };

  // console.log("All Scores:", allScores);
  console.log("Averages:", averages);



  if (!open || !data || items.length === 0) return null;

  const currentItem = items[currentIndex];
  const result = currentItem.azureResult;
  const overall = result?.pronunciationScores?.overall;
  const hasError = !!currentItem.error || !!result?.error;
  const scores = items[currentIndex]?.azureResult?.
    rawJsonResult?.NBest[0]?.
    PronunciationAssessment;
  console.log(JSON.stringify(scores), "scores")
  const AverageProsody =
    items.reduce((acc, item) => {
      const score =
        item?.azureResult?.rawJsonResult?.NBest?.[0]?.PronunciationAssessment?.ProsodyScore;
      return acc + (score ?? 0); // agar undefined ho to 0 lelo
    }, 0) / items.length;

  console.log("Average Prosody:", AverageProsody);




  //console.log("scores",scores)
  const raw = result?.rawJsonResult;
  const words = raw?.NBest?.[0]?.Words || [];
  const confidence = raw?.NBest?.[0]?.Confidence ?? 0;

  const allPages = items.map((item) => item.recording_page);
  const sortedUniquePages = [...new Set(allPages)].sort((a, b) => a - b);

  const isSequential = sortedUniquePages.some((page, index, arr) => {
    if (index === 0) return false;
    return page === arr[index - 1] + 1;
  });

  // Expected words
  const referenceText = currentItem.pageText ?? "";
  const expectedWords = referenceText
    .replace(/[’‘]/g, "'")
    .replace(/[“”",?.]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  // Spoken words
  const spokenWordsRaw = words;
  const spokenWords = spokenWordsRaw.map((w) => w.Word.toLowerCase());

  // Keep spokenIndex so we can jump to the exact audio offsets
  const alignedResults = expectedWords.map((refWord, idx) => {
    const spokenIndex = spokenWords.findIndex((w, i) => i >= idx && w === refWord);
    const wordObj = spokenWordsRaw[spokenIndex];

    if (spokenIndex !== -1 && wordObj?.PronunciationAssessment) {
      return {
        word: refWord,
        accuracy: wordObj.PronunciationAssessment.AccuracyScore,
        matched: true,
        spokenIndex,
      };
    }
    return {
      word: refWord,
      accuracy: 0,
      matched: false,
      spokenIndex: -1,
    };
  });

  const handleEnd = () => {
    handleNext();
    setAutoPlay(true);
  };

  const handleNext = () =>
    setCurrentIndex((prev) => Math.min(prev + 1, items.length - 1));
  const handlePrevious = () =>
    setCurrentIndex((prev) => Math.max(prev - 1, 0));

  const getColor = (score, variant = "dark") => {
    if (variant === "light") {
      if (score >= 80) return "#c8e6c9";
      if (score >= 40) return "#fff9c4";
      return "#ffcdd2";
    } else {
      if (score >= 80) return "#2e7d32";
      if (score >= 40) return "#f9a825";
      return "#c62828";
    }
  };

  const barWrapper = {
    background: "#e0e0e0",
    borderRadius: "4px",
    overflow: "hidden",
    height: "18px",
  };
  const labelStyle = { marginBottom: "4px", fontWeight: 500 };
  const bar = (width) => ({
    width: `${width}%`,
    backgroundColor: getColor(width),
    height: "100%",
    transition: "width 0.5s ease",
    borderRadius: "4px",
  });

  const mispronunciationThreshold = 60;
  const mispronunciations = spokenWordsRaw.filter(
    (w) => (w?.PronunciationAssessment?.AccuracyScore ?? 100) < mispronunciationThreshold
  );

  function Roundoff(decimalVal) {
    return Math.round(decimalVal);
  }
  // Long pause count (gap in milliseconds > 700)
  let longPauseCount = 0;
  for (let i = 1; i < spokenWordsRaw.length; i++) {
    const prevEnd = spokenWordsRaw[i - 1].Offset + spokenWordsRaw[i - 1].Duration;
    const currStart = spokenWordsRaw[i].Offset;
    if ((currStart - prevEnd) / 10000 > 700) longPauseCount++;
  }
  // alert(data.title)
  // === Word-level playback ===
  const playWord = (wordObj) => {
    if (!audioRef.current || !wordObj) return;
    const audio = audioRef.current.audio.current;
    if (!audio) return;

    const startTime = wordObj.Offset / 10_000_000; // seconds
    const endTime = (wordObj.Offset + wordObj.Duration) / 10_000_000;

    // Clean any previous listeners to avoid stacking
    const clean = () => audio.removeEventListener("timeupdate", stopListener);

    const stopListener = () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        clean();
      }
    };

    clean(); // just in case
    audio.currentTime = startTime;
    audio.play();
    audio.addEventListener("timeupdate", stopListener);
  };


  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={modalStyle}>
        {currentItem.type === "Average" ? (
          <>
            <div style={headerStyle}>{data.title}</div>
            <div>
              <h3 style={{ marginLeft: "10px" }}>Pronounciation score</h3>
              <div style={{ display: "flex", gap: "60px", marginLeft: "10px" }}>
                <div>
                  <p>
                    Accuracy: <span style={{ color: getColor(averages.accuracy) }}>{Roundoff(averages.accuracy)}%</span>
                  </p>
                  <p>
                    Fluency: <span style={{ color: getColor(averages.fluency) }}>{Roundoff(averages.fluency)}%</span>
                  </p>
                </div>

                <div>
                  <p>
                    Completeness:{" "}
                    <span style={{ color: getColor(averages.completeness) }}>
                      {Roundoff(averages.completeness)}%
                    </span>
                  </p>

                  <p>
                    Prosody:{" "}
                    <span style={{ color: getColor(AverageProsody) }}>
                      {Roundoff(AverageProsody)}%
                    </span>
                  </p>
                </div>

                <div style={{ position: "relative", display: "inline-flex" }}>
                  <CircularProgress
                    variant="determinate"
                    value={averages?.overall ?? 0}
                    size={100}
                    thickness={10}
                    style={{ color: getColor(averages?.overall ?? 0) }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%)",
                      fontWeight: "bold",
                      fontSize: "20px",
                      color: "black",
                    }}
                  >
                    {Roundoff(averages?.overall ?? 0)}
                  </div>
                </div>
                <div >
                  <div>
                    <span style={{ color: "#c62828", fontWeight: "bold", fontSize: "20px" }}>●</span> 0–39
                  </div>
                  <div>
                    <span style={{ color: "#f9a825", fontWeight: "bold", fontSize: "20px" }}>●</span> 40–79
                  </div>
                  <div>
                    <span style={{ color: "#2e7d32", fontWeight: "bold", fontSize: "20px" }}>●</span> 80–100
                  </div>
                </div>
              </div>
              <div style={{ width: "90%", height: "200px", margin: "auto", padding: "10px", overflow: "auto", }}>
                <h3 style={{ margin: "10px" }}>Page Level Details</h3>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", padding: "8px" }}>Page</th>
                      <th></th>
                      <th style={{ textAlign: "left", padding: "8px" }}>Score</th>
                    </tr>
                  </thead>

                  <tbody>
                    {items.slice(1).map((item, idx) => {
                      const score = item?.azureResult?.pronunciationScores?.overall ?? 0;
                      return (
                        <tr key={idx}>
                          {/* Page number */}
                          <td style={{ padding: "8px" }}>
                            <span>Page </span>
                            {isSequential
                              ? idx + 1
                              : item.recording_page === 0
                                ? 1
                                : item.recording_page}
                          </td>

                          <td>

                            <div
                              style={{
                                width: "100px",
                                height: "8px",
                                background: "#eee",
                                borderRadius: "4px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: `${score}%`,
                                  height: "100%",
                                  background: score >= 75 ? "green" : score >= 50 ? "orange" : "red",
                                }}
                              />
                            </div>

                          </td>
                          {/* Bar + % */}
                          <td style={{ padding: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              {/* progress bar */}


                              {/* percentage */}
                              <span>{Roundoff(score)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

              </div>

            </div>

            <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
              <Button variant="outlined" onClick={handlePrevious} disabled={currentIndex === 0}>
                ⬅ Previous
              </Button>
              <div>
                <Button
                  variant="outlined"
                  onClick={handleNext}
                  disabled={currentIndex === items.length - 1}
                  style={{ marginRight: 10 }}
                >
                  Next ➡
                </Button>
                <Button variant="contained" color="error" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div style={headerStyle}>
              📝 Page{" "}
              {isSequential
                ? currentItem.recording_page + 1
                : currentItem.recording_page === 0
                  ? 1
                  : currentItem.recording_page}
            </div>

            <div style={bodyStyle}>
              <p style={paragraphStyle}>
                <strong>File:</strong> {data.title}
              </p>

              <AudioPlayer
                ref={audioRef}
                src={currentItem.recordingURL}
                showJumpControls={false}
                layout="horizontal"
                autoPlay={autoPlay}
                onEnded={handleEnd}
                style={{
                  marginBottom: 20,
                  width: "100%",
                  borderRadius: 10,
                  padding: 10,
                  background: "linear-gradient(90deg, #e3f2fd, #1692f9ff)",
                  boxShadow: "0px 3px 10px rgba(25, 118, 210, 0.2)",
                  border: "1px solid #198eeeff",
                }}
              />

              {hasError ? (
                <p style={{ color: "#d32f2f", fontWeight: "bold" }}>
                  ❌ Unable to evaluate this recording.
                </p>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
                    {/* Circular Pronunciation Score */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ position: "relative", display: "inline-flex" }}>
                        <CircularProgress
                          variant="determinate"
                          value={overall ?? 0}
                          size={100}
                          thickness={5}
                          style={{ color: getColor(overall ?? 0) }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "50%",
                            left: "50%",
                            transform: "translate(-50%, -50%)",
                            fontWeight: "bold",
                            fontSize: "20px",
                            color: "black",
                          }}
                        >
                          {Roundoff(overall ?? 0)}
                        </div>
                      </div>
                      <div style={{ marginTop: 8, fontWeight: "bold", color: "#333" }}>
                        Pronunciation Score
                      </div>
                      <div style={{ marginTop: 12, fontSize: "13px", color: "#555", lineHeight: "1.8" }}>
                        <div>
                          <span style={{ color: "#c62828", fontWeight: "bold", fontSize: "20px" }}>●</span> 0–39
                        </div>
                        <div>
                          <span style={{ color: "#f9a825", fontWeight: "bold", fontSize: "20px" }}>●</span> 40–79
                        </div>
                        <div>
                          <span style={{ color: "#2e7d32", fontWeight: "bold", fontSize: "20px" }}>●</span> 80–100
                        </div>
                      </div>
                    </div>

                    {/* Bars */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "12px", flex: 1 }}>
                      {[
                        { label: "Accuracy", value: scores?.AccuracyScore ?? 0 },
                        { label: "Prosody", value: Roundoff(scores?.ProsodyScore) ?? 0 },
                        { label: "Fluency", value: scores?.FluencyScore ?? 0 },
                        { label: "Completeness", value: scores?.CompletenessScore ?? 0 },
                      ].map(({ label, value }) => (
                        <div key={label}>
                          <div style={labelStyle}>{label}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ ...barWrapper, flex: 1 }}>
                              <div style={bar(value)} />
                            </div>
                            <div style={{ minWidth: 45, textAlign: "right", fontWeight: 500 }}>{value}/100</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {alignedResults.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 10 }}>
                        Word-Level Comparison (click a word to play it)
                      </h3>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 20 }}>
                        <div style={{ color: "#d32f2f", fontWeight: "bold" }}>
                          ❗ Mispronunciations: {mispronunciations.length}
                        </div>
                        <div style={{ color: "#f57c00", fontWeight: "bold" }}>
                          ⏸️ Long Pauses: {longPauseCount}
                        </div>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap" }}>
                        {alignedResults.map((w, i) => {
                          const prevWord = spokenWordsRaw[w.spokenIndex - 1];
                          const currWord = spokenWordsRaw[w.spokenIndex];
                          let hasLongPause = false;
                          if (prevWord && currWord) {
                            const prevEnd = prevWord.Offset + prevWord.Duration;
                            const currStart = currWord.Offset;
                            hasLongPause = (currStart - prevEnd) / 10000 > 700;
                          }

                          const clickable = w.spokenIndex !== -1 && spokenWordsRaw[w.spokenIndex];

                          return (
                            <React.Fragment key={`${w.word}-${i}`}>
                              {hasLongPause && (
                                <div
                                  style={{
                                    padding: "4px 8px",
                                    backgroundColor: "#ffecb3",
                                    color: "#5a6452ff",
                                    borderRadius: "4px",
                                    margin: "4px",
                                    fontWeight: "bold",
                                  }}
                                  title="⏸ Long pause before this word (over 700ms gap)"
                                >
                                  ⏸
                                </div>
                              )}
                              <div
                                onClick={() => clickable && playWord(spokenWordsRaw[w.spokenIndex])}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  margin: "4px",
                                  backgroundColor: getColor(w.accuracy, "light"),
                                  color: getColor(w.accuracy, "dark"),
                                  cursor: clickable ? "pointer" : "default",
                                  opacity: clickable ? 1 : 0.7,
                                }}
                                title={`Word: ${w.word}\nAccuracy: ${w.accuracy || 0}${clickable ? "\n(Click to play this word)" : ""
                                  }`}
                              >
                                {w.word}
                                {w.accuracy ? ` (${w.accuracy})` : ""}
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div style={{ marginTop: 20, display: "flex", justifyContent: "space-between" }}>
                <Button variant="outlined" onClick={handlePrevious} disabled={currentIndex === 0}>
                  ⬅ Previous
                </Button>
                <div>
                  <Button
                    variant="outlined"
                    onClick={handleNext}
                    disabled={currentIndex === items.length - 1}
                    style={{ marginRight: 10 }}
                  >
                    Next ➡
                  </Button>
                  <Button variant="contained" color="error" onClick={onClose}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </Box>
    </Modal>
  );


};

export default AssessmentModal;
