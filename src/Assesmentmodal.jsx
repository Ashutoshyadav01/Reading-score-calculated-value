import React, { useState, useRef } from "react";
import { CircularProgress, Button, Modal, Box } from "@mui/material";
import { Tooltip, IconButton } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";

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



const bodyStyle = { padding: "24px" };
const paragraphStyle = { fontSize: "15px", margin: "8px 0", color: "#333" };

const AssessmentModal = ({ open, onClose, data }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [wordToInvestigate, setWordToInvestigate] = useState("");
  const audioRef = useRef(null);

  const items = [
    {
      type: "Average"
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




  if (!open || !data || items.length === 0) return null;

  const currentItem = items[currentIndex];
  const result = currentItem.azureResult;

  const hasError = !!currentItem.error || !!result?.error;
  const scores = items[currentIndex]?.azureResult?.
    rawJsonResult?.NBest[0]?.
    PronunciationAssessment;
  //console.log(JSON.stringify(scores), "scores")
  const AverageProsody =
    items.reduce((acc, item) => {
      const score =
        item?.azureResult?.rawJsonResult?.NBest?.[0]?.PronunciationAssessment?.ProsodyScore;
      return acc + (score ?? 0); // agar undefined ho to 0 lelo
    }, 0) / items.length;

  //console.log("Average Prosody:", AverageProsody);




  ////console.log("scores",scores)
  const raw = result?.rawJsonResult;
  const words = raw?.NBest?.[0]?.Words || [];


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

  const handleNext = () => {
    //console.log(currentIndex)
    setCurrentIndex((prev) => Math.min(prev + 1, items.length - 1));
    setWordToInvestigate(null);
  }
  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(prev - 1, 0));
    setWordToInvestigate(null)
  }

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

    const audio = audioRef.current; // now directly the <audio> element

    const startTime = wordObj.Offset / 10_000_000; // seconds
    const endTime = (wordObj.Offset + wordObj.Duration) / 10_000_000;

    // Clear any previous listeners
    const stopListener = () => {
      if (audio.currentTime >= endTime) {
        audio.pause();
        audio.removeEventListener("timeupdate", stopListener);
      }
    };

    audio.currentTime = startTime;
    audio.play();
    audio.addEventListener("timeupdate", stopListener);
  };



  return (
    <Modal open={open} onClose={onClose}>
      <Box sx={modalStyle}>
        {currentItem.type === "Average" ? (
          <>
            <div >{data.title}</div>
            <div>
              <h3 style={{ marginLeft: "10px" }}>Pronounciation score</h3>
              <div style={{ display: "flex", gap: "60px", marginLeft: "10px" }}>
                <div>
                  <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: "auto" }}>
                    Accuracy:
                    <span style={{ color: getColor(averages.accuracy) }}>
                      {Roundoff(averages.accuracy)}%
                    </span>
                    <Tooltip title="Pronunciation accuracy of the speech. Accuracy indicates how closely the phonemes match a native speaker's pronunciation. Word and full text accuracy scores are aggregated from phoneme-level accuracy score.">
                      <IconButton size="small">
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </p>

                  <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                    Fluency: <span style={{ color: getColor(averages.fluency) }}>{Roundoff(averages.fluency)}%

                    </span>
                    <Tooltip title="Fluency of the given speech. Fluency indicates how closely the speech matches a native speaker's use of silent breaks between words.">
                      <IconButton size="small">
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                  </p>
                </div>

                <div>
                  <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                    Completeness:{" "}
                    <span style={{ color: getColor(averages.completeness) }}>
                      {Roundoff(averages.completeness)}%

                    </span>
                    <Tooltip title="Completeness of the speech, calculated by the ratio of pronounced words to the input reference text.">
                      <IconButton size="small">
                        <InfoOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>

                  </p>

                  <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                    Prosody:{" "}
                    <span style={{ color: getColor(AverageProsody) }}>
                      {Roundoff(AverageProsody)}%
                      <Tooltip title="Prosody of the given speech. Prosody indicates how nature of the given speech, including stress, intonation, speaking speed and rhythm.">
                        <IconButton size="small">
                          <InfoOutlinedIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
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
                        <tr key={idx} onClick={()=>setCurrentIndex(idx+1)}>
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
                                width: "300px",
                                height: "8px",
                                background: "#eee",
                                borderRadius: "4px",
                                overflow: "hidden",
                                margin: "auto"
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
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <strong onClick={()=>setCurrentIndex(0)}>{data.title} &gt; </strong>
              <span> Page{" "}
                {isSequential
                  ? currentItem.recording_page + 1
                  : currentItem.recording_page === 0
                    ? 1
                    : currentItem.recording_page}
              </span>
            </div>


            <div style={bodyStyle}>
              <p style={paragraphStyle}>

              </p>



              {hasError ? (
                <p style={{ color: "#d32f2f", fontWeight: "bold" }}>
                  ❌ Unable to evaluate this recording.
                </p>
              ) : (
                <>
                  <h3 style={{ marginLeft: "10px" }}>Pronounciation score</h3>
                  <div style={{ display: "flex", justifyContent: "space-around", marginLeft: "10px" }}>
                    <div >
                      <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: "auto" }}>
                        Accuracy:
                        <span style={{ color: getColor(scores?.AccuracyScore) }}>
                          {Roundoff(scores.AccuracyScore)}%
                        </span>
                        <Tooltip title="Pronunciation accuracy of the speech. Accuracy indicates how closely the phonemes match a native speaker's pronunciation. Word and full text accuracy scores are aggregated from phoneme-level accuracy score.">
                          <IconButton size="small">
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </p>

                      <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                        Fluency: <span style={{ color: getColor(scores.FluencyScore) }}>{Roundoff(scores?.FluencyScore)}%

                        </span>
                        <Tooltip title="Fluency of the given speech. Fluency indicates how closely the speech matches a native speaker's use of silent breaks between words.">
                          <IconButton size="small">
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                      </p>
                    </div>

                    <div>
                      <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                        Completeness:{" "}
                        <span style={{ color: getColor(scores.CompletenessScore) }}>
                          {Roundoff(scores.CompletenessScore)}%

                        </span>
                        <Tooltip title="Completeness of the speech, calculated by the ratio of pronounced words to the input reference text.">
                          <IconButton size="small">
                            <InfoOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>

                      </p>

                      <p style={{ display: "flex", alignItems: "center", gap: "6px", margin: 0 }}>
                        Prosody:{" "}
                        <span style={{ color: getColor(scores?.ProsodyScore) }}>
                          {Roundoff(scores?.ProsodyScore)}%
                          <Tooltip title="Prosody of the given speech. Prosody indicates how nature of the given speech, including stress, intonation, speaking speed and rhythm.">
                            <IconButton size="small">
                              <InfoOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </span>
                      </p>
                    </div>

                    <div style={{ position: "relative", display: "inline-flex" }}>
                      <CircularProgress
                        variant="determinate"
                        value={scores.PronScore ?? 0}
                        size={100}
                        thickness={10}
                        style={{ color: getColor(scores?.PronScore ?? 0) }}
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
                        {Roundoff(scores?.PronScore ?? 0)}
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

                  {alignedResults.length > 0 && (
                    <div style={{ marginTop: 24 }}>
                      <h3 style={{ fontSize: 16, fontWeight: "bold", marginBottom: 10 }}>
                        Word Level Details
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
                                onClick={() => clickable && setWordToInvestigate(spokenWordsRaw[w.spokenIndex])}
                                style={{
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  margin: "4px",
                                  backgroundColor: getColor(w.accuracy, "light"),
                                  color: getColor(w.accuracy, "dark"),
                                  cursor: clickable ? "pointer" : "default",
                                  opacity: clickable ? 1 : 0.7,
                                }}
                                title={`Word: ${w.word}\nAccuracy: ${w.accuracy || 0}${clickable ? "\n(Click to select this word)" : ""}`}
                              >
                                {w.word}
                                {w.accuracy ? ` (${w.accuracy})` : ""}
                              </div>

                            </React.Fragment>
                          );
                        })}
                      </div>
                      {wordToInvestigate && (
                        <div style={{ marginTop: "20px", padding: "10px", border: "1px solid #ddd", borderRadius: "6px" }}>
                          <span style={{ marginRight: "10px" }}>{wordToInvestigate?.Word}</span>
                          <span
                            style={{ color: "blue", cursor: "pointer", textDecoration: "underline", marginRight: "10px" }}
                            onClick={() => playWord(wordToInvestigate)}
                          >
                            🔊 What you pronounced?
                          </span>
                          <span>Correct pronunciation</span>
                        </div>
                      )}

                    </div>
                  )}
                </>
              )}
              <audio
                ref={audioRef}
                src={currentItem.recordingURL}
                controls
                autoPlay={autoPlay}
                onEnded={handleEnd}
                style={{
                  marginBottom: 20,
                  width: "100%",
                  borderRadius: 10,
                  padding: 10,
                  //background: "linear-gradient(90deg, #e3f2fd, #1692f9ff)",
                  //boxShadow: "0px 3px 10px rgba(25, 118, 210, 0.2)",
                  //border: "1px solid #198eeeff",
                }}
              />

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
