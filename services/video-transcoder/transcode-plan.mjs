// Plan kodowania ma jedno źródło: services/caption-burner/transcode-plan.mjs.
// W repozytorium to tylko przekierowanie; build.sh wkłada do paczki Lambdy
// prawdziwą kopię pliku w to miejsce.
export * from "../caption-burner/transcode-plan.mjs";
