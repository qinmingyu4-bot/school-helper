(() => {
  const names = [
    "Centennial College",
    "University of Toronto",
    "University of British Columbia",
    "McGill University",
    "University of Waterloo",
    "University of Alberta",
    "York University",
    "Toronto Metropolitan University",
    "University of Ottawa",
    "University of Calgary",
    "University of Victoria",
    "University of Windsor",
    "Western University",
    "Queen's University",
    "University of Manitoba",
    "University of Saskatchewan",
    "University of Guelph",
    "University of Montreal",
    "University of Southern California",
    "University of California, Berkeley",
    "University of California, Los Angeles",
    "University of Washington",
    "University of Michigan",
    "University of Pennsylvania"
  ];

  function ensureDatalist() {
    let list = document.querySelector("#studybridgeSchoolDatalist");
    if (!list) {
      list = document.createElement("datalist");
      list.id = "studybridgeSchoolDatalist";
      list.innerHTML = names.map((name) => `<option value="${name}"></option>`).join("");
      document.body.appendChild(list);
    }
    document.querySelectorAll("#schoolInput, #onboardingSchoolInput").forEach((input) => {
      input.setAttribute("list", "studybridgeSchoolDatalist");
      input.setAttribute("autocomplete", "off");
    });
  }

  ensureDatalist();
  setInterval(ensureDatalist, 500);
})();
